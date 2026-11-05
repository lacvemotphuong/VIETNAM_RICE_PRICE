import json
import logging
import math
import os
import csv
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("rice-price-ai")
ASSET_DIR = Path(__file__).resolve().parent / "assets"
CONTRACTS_PATH = Path(__file__).resolve().parent / "model_contracts.json"
TRAINING_DATA_PATH = ASSET_DIR / "vietfood_agroinfo_cleaned_final.csv"
SERIES_MODELS_DIR = ASSET_DIR / "series_models"
SERIES_INDEX_PATH = SERIES_MODELS_DIR / "index.json"
MODEL_NAMES = ("ann", "lstm", "sarimax", "xgboost")
FORECAST_HORIZONS_MONTHS = (1, 3, 6)
ACTUAL_HISTORY_MONTHS = 6
MIN_TRAINING_SAMPLES = 36


@lru_cache(maxsize=1)
def _monthly_training_series() -> dict[tuple[str, str], tuple[tuple[int, str, float | None], ...]]:
    if not TRAINING_DATA_PATH.is_file():
        raise FileNotFoundError(f"Training data file not found: {TRAINING_DATA_PATH.name}")

    grouped: dict[tuple[str, str], dict[int, list[float]]] = {}
    with TRAINING_DATA_PATH.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required_columns = {"date", "product", "location", "time_granularity", "standardized_price"}
        if not reader.fieldnames or not required_columns.issubset(reader.fieldnames):
            raise ValueError(
                "Training CSV must contain date, product, location, time_granularity, and standardized_price."
            )

        for line_number, row in enumerate(reader, start=2):
            if (row.get("time_granularity") or "").strip().lower() != "month":
                continue
            product = (row.get("product") or "").strip()
            location = (row.get("location") or "").strip()
            if not product or not location or product.casefold() == "lúa mì":
                continue
            try:
                observation_date = datetime.strptime((row.get("date") or "").strip(), "%Y-%m-%d")
                price = float(row.get("standardized_price") or "")
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Invalid monthly observation on CSV line {line_number}.") from exc
            if not math.isfinite(price):
                raise ValueError(f"Invalid standardized price on CSV line {line_number}.")

            period = observation_date.year * 12 + observation_date.month - 1
            grouped.setdefault((product, location), {}).setdefault(period, []).append(price)

    if not grouped:
        raise ValueError("Training CSV contains no monthly product/location series.")

    result = {}
    for key, monthly_prices in grouped.items():
        observations = []
        for period in range(min(monthly_prices), max(monthly_prices) + 1):
            prices = monthly_prices.get(period, [])
            month_label = f"{period // 12:04d}-{period % 12 + 1:02d}"
            observations.append((period, month_label, sum(prices) / len(prices) if prices else None))
        result[key] = tuple(observations)
    return result


def _supported_forecast_horizons(
    observations: tuple[tuple[int, str, float | None], ...],
    feature_names: tuple[str, ...] = ("lag_1", "lag_2", "lag_3", "lag_12"),
) -> list[int]:
    lag_offsets: list[int] = []
    for feature in feature_names:
        prefix, separator, lag_text = feature.partition("_")
        if prefix != "lag" or not separator or not lag_text.isdigit():
            return []
        lag = int(lag_text)
        if lag < 1:
            return []
        lag_offsets.append(lag)

    available_periods = {item[0] for item in observations if item[2] is not None}
    if not available_periods:
        return []
    latest_period = max(available_periods)
    supported: list[int] = []
    for horizon in FORECAST_HORIZONS_MONTHS:
        simulated_periods = set(available_periods)
        for forecast_step in range(1, horizon + 1):
            target_period = latest_period + forecast_step
            if any(target_period - lag not in simulated_periods for lag in lag_offsets):
                break
            simulated_periods.add(target_period)
        else:
            supported.append(horizon)
    return supported


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str
    input: dict[str, Any] | None = None
    steps: int | None = Field(default=None, ge=1, le=365)
    exog: list[list[float]] | None = None
    product: str | None = None
    location: str | None = None
    horizon_months: int | None = Field(default=None, ge=1, le=6)


class ModelRegistry:
    def __init__(self) -> None:
        self.errors: dict[str, str] = {}
        self.features: dict[str, list[str]] = {}
        self.series_artifacts: dict[tuple[str, str], dict[str, Any]] = {}
        self.loaded_series_models: dict[tuple[str, str], dict[str, Any]] = {}

    def load_all(self) -> None:
        if not SERIES_INDEX_PATH.is_file():
            message = "Per-product model artifacts are missing; run src/ai/train_models.py."
            self.errors = {name: message for name in MODEL_NAMES}
            return
        try:
            index = json.loads(SERIES_INDEX_PATH.read_text(encoding="utf-8"))
            entries = index.get("series") if isinstance(index, dict) else None
            if not isinstance(entries, list):
                raise ValueError("The model series index must contain a series list.")
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                product = entry.get("product")
                location = entry.get("location")
                artifact_key = entry.get("artifact_key")
                model_names = entry.get("models")
                if (
                    not isinstance(product, str)
                    or not isinstance(location, str)
                    or not isinstance(artifact_key, str)
                    or not isinstance(model_names, list)
                    or not all(name in MODEL_NAMES for name in model_names)
                ):
                    continue
                self.series_artifacts[(product, location)] = entry
                feature_names = entry.get("feature_names")
                if isinstance(feature_names, list):
                    for name in MODEL_NAMES:
                        self.features.setdefault(name, feature_names)
            for name in MODEL_NAMES:
                if not any(name in entry["models"] for entry in self.series_artifacts.values()):
                    self.errors[name] = "No trained product/location artifact is available."
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            logger.exception("Unable to read the product/location model index")
            self.errors = {name: f"Invalid series model index: {exc}" for name in MODEL_NAMES}

    @staticmethod
    def _load_keras(path: Path) -> Any:
        from tensorflow import keras

        try:
            return keras.models.load_model(path, compile=False)
        except (TypeError, ValueError) as exc:
            if "quantization_config" not in str(exc):
                raise
            return ModelRegistry._load_keras_compat(path)

    @staticmethod
    def _load_keras_compat(path: Path) -> Any:
        import json
        import tempfile
        import zipfile

        from tensorflow import keras

        with tempfile.NamedTemporaryFile(suffix=".keras", delete=False) as handle:
            temp_path = Path(handle.name)

        try:
            with zipfile.ZipFile(path, "r") as source, zipfile.ZipFile(temp_path, "w") as target:
                for info in source.infolist():
                    payload = source.read(info.filename)
                    if info.filename.endswith("config.json"):
                        config = json.loads(payload.decode("utf-8"))
                        config = ModelRegistry._strip_quantization_config(config)
                        payload = json.dumps(config, separators=(",", ":")).encode("utf-8")
                    target.writestr(info, payload)

            return keras.models.load_model(temp_path, compile=False)
        finally:
            temp_path.unlink(missing_ok=True)

    @staticmethod
    def _strip_quantization_config(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: ModelRegistry._strip_quantization_config(item)
                for key, item in value.items()
                if key != "quantization_config"
            }
        if isinstance(value, list):
            return [ModelRegistry._strip_quantization_config(item) for item in value]
        return value

    @staticmethod
    def _ensure_legacy_numpy_compat() -> None:
        import importlib
        import sys
        import types

        try:
            import numpy as np
        except ModuleNotFoundError:
            return

        if "numpy._core.numeric" in sys.modules:
            return

        module = sys.modules.get("numpy._core")
        if module is None:
            module = types.ModuleType("numpy._core")
            sys.modules["numpy._core"] = module
        if not hasattr(module, "__path__"):
            module.__path__ = []

        for name in (
            "numeric",
            "multiarray",
            "_multiarray_umath",
            "_dtype",
            "_methods",
            "_exceptions",
            "_struct",
            "_type_aliases",
            "umath",
            "defchararray",
        ):
            try:
                submodule = importlib.import_module(f"numpy.core.{name}")
            except ModuleNotFoundError:
                continue
            sys.modules[f"numpy._core.{name}"] = submodule
            setattr(module, name, submodule)

        try:
            numeric_module = importlib.import_module("numpy.core.numeric")
        except ModuleNotFoundError:
            return
        sys.modules["numpy._core.numeric"] = numeric_module
        setattr(module, "numeric", numeric_module)

    @staticmethod
    def _load_sarimax(path: Path) -> Any:
        import joblib

        ModelRegistry._ensure_legacy_numpy_compat()
        return joblib.load(path)

    def _load_xgboost(self, path: Path) -> Any:
        import xgboost as xgb

        model = xgb.Booster()
        model.load_model(path)
        if not model.feature_names:
            raise ValueError("The XGBoost artifact does not contain feature names.")
        return model

    def status(self) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for name in MODEL_NAMES:
            error = self.errors.get(name)
            available_series = sum(
                name in entry["models"] for entry in self.series_artifacts.values()
            )
            result[name] = {
                "loaded": available_series > 0,
                "available": available_series > 0 and error is None,
                "features": self.features.get(name, []),
                "input_shape": None,
                "available_series": available_series,
                "reason": error,
            }
        return result

    def load_series_models(
        self,
        product: str,
        location: str,
        name: str,
    ) -> dict[str, Any]:
        key = (product, location)
        cached = self.loaded_series_models.get(key)
        if cached is not None and name in cached["models"]:
            return cached
        entry = self.series_artifacts.get(key)
        if entry is None:
            raise HTTPException(
                status_code=422,
                detail="No trained forecast is available for the selected product and location.",
            )

        artifact_dir = SERIES_MODELS_DIR / entry["artifact_key"]
        filenames = {
            "ann": "ann_model.keras",
            "lstm": "lstm_model.keras",
            "sarimax": "sarimax_model.pkl",
            "xgboost": "xgboost_model.json",
        }
        loaders = {
            "ann": self._load_keras,
            "lstm": self._load_keras,
            "sarimax": self._load_sarimax,
            "xgboost": self._load_xgboost,
        }
        try:
            models = dict(cached["models"]) if cached is not None else {}
            if cached is None:
                contracts_path = artifact_dir / "model_contracts.json"
                contracts = json.loads(contracts_path.read_text(encoding="utf-8"))
            else:
                contracts = cached["contracts"]
            if not isinstance(contracts, dict):
                raise ValueError("Series model contracts must be a JSON object.")
            if name not in entry["models"]:
                raise ValueError(f"{name} is not trained for this product/location series.")
            models[name] = loaders[name](artifact_dir / filenames[name])
            bundle = {
                "models": models,
                "contracts": contracts,
            }
        except Exception as exc:
            logger.exception("Unable to load models for %s / %s", product, location)
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "series_model_unavailable",
                    "message": f"Unable to load the trained models for this series: {type(exc).__name__}: {exc}",
                },
            ) from exc

        current = self.loaded_series_models.get(key)
        if current is not None:
            bundle["models"] = {**current["models"], **bundle["models"]}
        self.loaded_series_models[key] = bundle
        if len(self.loaded_series_models) > 2:
            oldest_key = next(iter(self.loaded_series_models))
            if oldest_key != key:
                del self.loaded_series_models[oldest_key]
        return bundle

    def _is_predictable(
        self,
        name: str,
        model: Any,
        contracts: dict[str, Any],
    ) -> tuple[bool, dict[str, Any]]:
        if name == "xgboost":
            features = list(getattr(model, "feature_names", []) or [])
            return bool(features), {"features": features}
        if name == "sarimax":
            if model is None:
                return False, {"reason": "Model artifact is not loaded."}
            if not callable(getattr(model, "get_forecast", None)) and not callable(
                getattr(model, "forecast", None)
            ):
                return False, {"reason": "Artifact does not expose a forecast method."}
            fitted_model = getattr(model, "model", None)
            return True, {"features": list(getattr(fitted_model, "exog_names", []) or [])}
        if name in ("ann", "lstm"):
            shape = getattr(model, "input_shape", None) if model is not None else None
            if isinstance(shape, list) or shape is None:
                return False, {"input_shape": shape, "reason": "Expected a single-input Keras model."}
            contract = contracts.get(name)
            if not isinstance(contract, dict):
                return False, {
                    "input_shape": shape,
                    "reason": "Add this model's feature_names and preprocessing from its training pipeline to model_contracts.json.",
                }
            feature_names = contract.get("feature_names")
            preprocessing = contract.get("preprocessing")
            feature_count = int(shape[-1]) if shape and shape[-1] is not None else 0
            if (
                not isinstance(feature_names, list)
                or len(feature_names) != feature_count
                or not all(isinstance(item, str) and item for item in feature_names)
            ):
                return False, {
                    "input_shape": shape,
                    "reason": f"Contract must define exactly {feature_count} feature_names in training order.",
                }
            if not self._valid_preprocessing(preprocessing, feature_count):
                return False, {
                    "input_shape": shape,
                    "reason": "Contract preprocessing must explicitly declare identity or standard_scaler parameters.",
                }
            return True, {
                "features": feature_names,
                "input_shape": shape,
                "contract": contract,
            }
        return False, {"reason": "Unknown model."}

    @staticmethod
    def _valid_preprocessing(preprocessing: Any, feature_count: int) -> bool:
        if not isinstance(preprocessing, dict):
            return False
        method = preprocessing.get("method")
        if method == "identity":
            return True
        if method == "standard_scaler":
            means = preprocessing.get("mean")
            scales = preprocessing.get("scale")
            return (
                isinstance(means, list)
                and isinstance(scales, list)
                and len(means) == feature_count
                and len(scales) == feature_count
                and all(_finite_number(item) for item in means + scales)
                and all(float(item) != 0 for item in scales)
            )
        return False

    def predict(self, request: PredictionRequest) -> dict[str, Any]:
        name = request.model.lower()
        if name not in MODEL_NAMES:
            raise HTTPException(status_code=422, detail=f"Unsupported model '{request.model}'.")
        if (
            request.input is not None
            or request.steps is not None
            or request.exog is not None
            or not request.product
            or not request.product.strip()
            or not request.location
            or not request.location.strip()
            or request.horizon_months is None
        ):
            raise HTTPException(
                status_code=422,
                detail="Product, location, and horizon_months are required; manual values and SARIMAX-only options are not supported.",
            )
        if request.horizon_months not in FORECAST_HORIZONS_MONTHS:
            raise HTTPException(
                status_code=422,
                detail=f"horizon_months must be one of {list(FORECAST_HORIZONS_MONTHS)}.",
            )

        unit = os.getenv("PRICE_UNIT", "").strip()
        if not unit:
            raise HTTPException(
                status_code=503,
                detail={"code": "prediction_unit_missing", "message": "Set PRICE_UNIT to the unit used by the model target before predicting."},
            )

        try:
            series_key = (request.product.strip(), request.location.strip())
            observations = _monthly_training_series().get(series_key)
            if observations is None:
                raise HTTPException(
                    status_code=422,
                    detail="The selected product and location are not present in the monthly training data.",
                )
            entry = self.series_artifacts.get(series_key)
            if entry is None or name not in entry["models"]:
                raise HTTPException(
                    status_code=422,
                    detail="No trained model is available for the selected product and location.",
                )
            supported_horizons = (
                list(FORECAST_HORIZONS_MONTHS)
                if name == "sarimax"
                else _supported_forecast_horizons(
                    observations,
                    tuple(entry.get("feature_names", ())),
                )
            )
            if request.horizon_months not in supported_horizons:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "The selected series does not have real lag values for all requested forecast months. "
                        f"Supported horizons for {name}: {supported_horizons}."
                    ),
                )

            bundle = self.load_series_models(*series_key, name)
            model = bundle["models"].get(name)
            if model is None:
                raise HTTPException(
                    status_code=503,
                    detail={"code": "series_model_unavailable", "message": f"{name} is not trained for the selected series."},
                )
            supported, details = self._is_predictable(name, model, bundle["contracts"])
            if not supported:
                raise HTTPException(
                    status_code=503,
                    detail={"code": "model_contract_missing", "message": details["reason"]},
                )

            prices_by_period = {
                period: price
                for period, _, price in observations
                if price is not None
            }
            latest_period = max(prices_by_period)
            actual_history = []
            for period in range(
                latest_period - ACTUAL_HISTORY_MONTHS + 1,
                latest_period + 1,
            ):
                year, month_index = divmod(period, 12)
                actual_history.append(
                    {
                        "month": f"{year:04d}-{month_index + 1:02d}",
                        "price": prices_by_period.get(period),
                    }
                )
            if name == "sarimax":
                predictions = self._forecast(model, request)
            else:
                predictions = []
                for forecast_step in range(1, request.horizon_months + 1):
                    target_period = latest_period + forecast_step
                    values_by_feature: dict[str, float] = {}
                    for feature in details["features"]:
                        prefix, separator, lag_text = feature.partition("_")
                        if prefix != "lag" or not separator or not lag_text.isdigit():
                            raise HTTPException(
                                status_code=503,
                                detail={
                                    "code": "unsupported_feature_contract",
                                    "message": f"Dataset forecasts require lag_N features; unsupported feature: {feature}.",
                                },
                            )
                        lag = int(lag_text)
                        feature_period = target_period - lag
                        if lag < 1 or feature_period not in prices_by_period:
                            raise HTTPException(
                                status_code=422,
                                detail=f"No observed or forecast value is available for {feature} in this month.",
                            )
                        values_by_feature[feature] = prices_by_period[feature_period]
                    values = _ordered_input(values_by_feature, details["features"])
                    next_prediction = self._predict_feature_model(name, model, values, details)
                    if len(next_prediction) != 1:
                        raise HTTPException(
                            status_code=502,
                            detail=f"{name} model must return exactly one value for each monthly step.",
                        )
                    predictions.extend(next_prediction)
                    prices_by_period[target_period] = next_prediction[0]
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Prediction failed for %s", name)
            raise HTTPException(
                status_code=502,
                detail={"code": "prediction_failed", "message": f"{name} model inference failed: {type(exc).__name__}: {exc}"},
            ) from exc

        if not predictions or not all(math.isfinite(value) for value in predictions):
            raise HTTPException(status_code=502, detail="Model returned an empty or non-finite prediction.")
        if len(predictions) != request.horizon_months:
            raise HTTPException(status_code=502, detail="SARIMAX returned a different number of forecasts than requested.")
        return {
            "model": name,
            "predictions": predictions,
            "unit": unit,
            "input": _request_input(request),
            "actual_history": actual_history,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    def _predict_feature_model(
        self,
        name: str,
        model: Any,
        values: list[float],
        details: dict[str, Any],
    ) -> list[float]:
        if name == "xgboost":
            import xgboost as xgb

            matrix = xgb.DMatrix(
                np.asarray([values], dtype=np.float32),
                feature_names=details["features"],
            )
            return [float(value) for value in model.predict(matrix).reshape(-1)]

        contract = details["contract"]
        processed_values = self._apply_preprocessing(values, contract["preprocessing"])
        shape = model.input_shape
        if len(shape) == 3:
            if shape[1] != 1:
                raise HTTPException(
                    status_code=503,
                    detail={"code": "unsupported_model_shape", "message": "Only a 1-step sequence contract is currently supported."},
                )
            batch = np.asarray([[processed_values]], dtype=np.float32)
        elif len(shape) == 2:
            batch = np.asarray([processed_values], dtype=np.float32)
        else:
            raise HTTPException(
                status_code=503,
                detail={"code": "unsupported_model_shape", "message": f"Unsupported Keras input shape {shape}."},
            )
        return [float(value) for value in np.asarray(model.predict(batch, verbose=0)).reshape(-1)]

    @staticmethod
    def _apply_preprocessing(values: list[float], preprocessing: dict[str, Any]) -> list[float]:
        if preprocessing["method"] == "identity":
            return values
        return [
            (value - float(mean)) / float(scale)
            for value, mean, scale in zip(values, preprocessing["mean"], preprocessing["scale"])
        ]

    @staticmethod
    def _forecast(model: Any, request: PredictionRequest) -> list[float]:
        steps = request.horizon_months or request.steps
        if steps is None:
            raise HTTPException(status_code=422, detail="'steps' is required for SARIMAX.")
        exog_names = list(getattr(getattr(model, "model", None), "exog_names", []) or [])
        if exog_names:
            if request.exog is None or len(request.exog) != steps:
                raise HTTPException(
                    status_code=422,
                    detail=f"SARIMAX requires {steps} future exog rows because the fitted model uses: {exog_names}.",
                )
            if any(len(row) != len(exog_names) for row in request.exog):
                raise HTTPException(
                    status_code=422,
                    detail=f"Each exog row must contain {len(exog_names)} values in this order: {exog_names}.",
                )
            if not all(_finite_number(value) for row in request.exog for value in row):
                raise HTTPException(status_code=422, detail="SARIMAX exog values must be finite numbers.")
            forecast = model.get_forecast(steps=steps, exog=np.asarray(request.exog, dtype=float))
        elif callable(getattr(model, "get_forecast", None)):
            forecast = model.get_forecast(steps=steps)
        else:
            forecast = model.forecast(steps=steps)
        means = getattr(forecast, "predicted_mean", forecast)
        return [float(value) for value in np.asarray(means).reshape(-1)]


def _finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def _ordered_input(data: dict[str, Any] | None, features: list[str]) -> list[float]:
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="Provide an 'input' object keyed by the model's feature names.")
    missing = [feature for feature in features if feature not in data]
    unexpected = [feature for feature in data if feature not in features]
    if missing or unexpected:
        raise HTTPException(
            status_code=422,
            detail={"message": "Input features must exactly match the model contract.", "missing": missing, "unexpected": unexpected},
        )
    values = [data[feature] for feature in features]
    if not all(_finite_number(value) for value in values):
        raise HTTPException(status_code=422, detail="All model input values must be finite numbers.")
    return [float(value) for value in values]


def _request_input(request: PredictionRequest) -> dict[str, Any]:
    return {
        "target": f"{request.product} · {request.location}",
        "product": request.product,
        "location": request.location,
        "horizon_months": request.horizon_months,
    }


registry = ModelRegistry()


@asynccontextmanager
async def lifespan(_: FastAPI):
    registry.load_all()
    yield


app = FastAPI(title="Vietnam Rice Price ML API", version="1.0.0", lifespan=lifespan)


@app.get("/health")
@app.get("/healthz")
def health() -> dict[str, Any]:
    status = registry.status()
    all_ready = all(item["available"] for item in status.values()) and bool(os.getenv("PRICE_UNIT", "").strip())
    return {
        "status": "ok" if all_ready else "degraded",
        "price_unit_configured": bool(os.getenv("PRICE_UNIT", "").strip()),
        "models": status,
    }


@app.get("/models")
def models() -> dict[str, Any]:
    return {
        "models": registry.status(),
        "price_unit_configured": bool(os.getenv("PRICE_UNIT", "").strip()),
    }


@app.get("/options")
def prediction_options() -> dict[str, Any]:
    try:
        observations_by_series = _monthly_training_series()
    except (OSError, ValueError, csv.Error) as exc:
        logger.exception("Unable to load monthly prediction series")
        raise HTTPException(
            status_code=503,
            detail={"code": "training_data_unavailable", "message": f"Unable to read monthly series data: {exc}"},
        ) from exc

    series = []
    for (product, location), observations in observations_by_series.items():
        entry = registry.series_artifacts.get((product, location))
        if entry is None:
            continue
        observed = [item for item in observations if item[2] is not None]
        if not observed:
            continue
        supported_horizons = _supported_forecast_horizons(observations)
        series.append(
            {
                "product": product,
                "location": location,
                "latest_month": observed[-1][1],
                "history_months": len(observed),
                "horizons_months": supported_horizons,
                "horizons_months_by_model": {
                    "sarimax": list(FORECAST_HORIZONS_MONTHS),
                    "ann": supported_horizons,
                    "lstm": supported_horizons,
                    "xgboost": supported_horizons,
                },
                "models": entry["models"],
            }
        )
    series.sort(
        key=lambda item: (
            item["latest_month"],
            item["product"].casefold(),
            item["location"].casefold(),
        ),
        reverse=True,
    )
    if not series:
        raise HTTPException(
            status_code=503,
            detail="No product/location series has trained model artifacts. Run src/ai/train_models.py.",
        )
    return {
        "series": series,
        "unit": os.getenv("PRICE_UNIT", "").strip() or None,
        "frequency": "month",
        "horizons_months": list(FORECAST_HORIZONS_MONTHS),
        "feature_names": ["lag_1", "lag_2", "lag_3", "lag_12"],
        "minimum_training_samples": MIN_TRAINING_SAMPLES,
    }


@app.post("/predict")
def predict(request: PredictionRequest) -> dict[str, Any]:
    return registry.predict(request)
