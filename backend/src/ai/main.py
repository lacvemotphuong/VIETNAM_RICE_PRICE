import logging
import math
import os
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("rice-price-ai")
ASSET_DIR = Path(__file__).resolve().parent / "assets"
PREDICTION_DATA_PATH = ASSET_DIR / "JASMINE_ALL_2008_2026.csv"
MODEL_FILES = {
    "random_forest": ("random_forest.pkl", "random_forest_eval_fixed.pkl"),
    "xgboost": ("xgboost.pkl", "xgboost_eval_fixed.pkl"),
}
MODEL_NAMES = tuple(MODEL_FILES)
MODEL_FEATURES = (
    "year",
    "month",
    "quarter",
    "day_of_week",
    "day_of_year",
    "lag_1",
    "lag_7",
    "rolling_mean_7",
    "location",
    "source",
    "price_type",
)
ACTUAL_HISTORY_MONTHS = 6
LAG_WINDOW = 7
FORECAST_HORIZONS_DAYS = (1, 2, 3)
VIETNAM_TIMEZONE = timezone(timedelta(hours=7))


class PriceObservation(BaseModel):
    date: date
    price: float = Field(ge=0, allow_inf_nan=False)
    unit: str
    source: str | None = None


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str
    product: str
    location: str
    horizon_days: int = Field(ge=1, le=3)


class ModelRegistry:
    def __init__(self) -> None:
        self.models: dict[str, Any] = {}
        self.contracts: dict[str, dict[str, list[str]]] = {}
        self.errors: dict[str, str] = {}

    @staticmethod
    def _artifact_path(name: str) -> Path:
        for filename in MODEL_FILES[name]:
            path = ASSET_DIR / filename
            if path.is_file():
                return path
        expected = " or ".join(MODEL_FILES[name])
        raise FileNotFoundError(f"Trained model artifact not found: {expected}")

    @staticmethod
    def _contract(model: Any) -> dict[str, list[str]]:
        feature_names = tuple(getattr(model, "feature_names_in_", ()))
        if feature_names != MODEL_FEATURES:
            raise ValueError(
                f"Expected model features {list(MODEL_FEATURES)} in training order; "
                f"found {list(feature_names)}."
            )

        try:
            categorical_pipeline = model.named_steps["preprocessing"].named_transformers_["categorical"]
            encoder = categorical_pipeline.named_steps["onehot"]
            categories = encoder.categories_
        except (AttributeError, KeyError, TypeError) as exc:
            raise ValueError("Model artifact does not expose its fitted categorical feature contract.") from exc

        if len(categories) != 3:
            raise ValueError("Model artifact must define location, source, and price_type categories.")
        contract = {
            name: [str(value) for value in values]
            for name, values in zip(("location", "source", "price_type"), categories)
        }
        if any(not values for values in contract.values()):
            raise ValueError("Model artifact contains an empty categorical feature contract.")
        if len(contract["price_type"]) != 1:
            raise ValueError("Model artifact must contain exactly one trained price_type.")
        return contract

    def load_all(self) -> None:
        import joblib

        for name in MODEL_NAMES:
            started_at = time.perf_counter()
            try:
                logger.info("Loading %s model artifact", name)
                path = self._artifact_path(name)
                model = joblib.load(path)
                if not callable(getattr(model, "predict", None)):
                    raise ValueError("Model artifact does not expose predict().")
                contract = self._contract(model)
                if name == "random_forest":
                    model.named_steps["regressor"].n_jobs = 1
                self.models[name] = model
                self.contracts[name] = contract
                self.errors.pop(name, None)
                logger.info("Loaded %s model artifact in %.2f seconds", name, time.perf_counter() - started_at)
            except Exception as exc:
                logger.exception(
                    "Unable to load the %s model artifact after %.2f seconds",
                    name,
                    time.perf_counter() - started_at,
                )
                self.models.pop(name, None)
                self.contracts.pop(name, None)
                self.errors[name] = f"{type(exc).__name__}: {exc}"

    def status(self) -> dict[str, dict[str, Any]]:
        result = {}
        for name in MODEL_NAMES:
            contract = self.contracts.get(name, {})
            locations = contract.get("location", [])
            result[name] = {
                "loaded": name in self.models,
                "available": name in self.models,
                "features": list(MODEL_FEATURES) if name in self.models else [],
                "input_shape": None,
                "available_series": len(locations),
                "locations": locations,
                "sources": contract.get("source", []),
                "price_types": contract.get("price_type", []),
                "reason": self.errors.get(name),
            }
        return result

    def predict(self, request: PredictionRequest) -> dict[str, Any]:
        name = request.model.strip().lower()
        if name not in MODEL_NAMES:
            raise HTTPException(status_code=422, detail=f"Unsupported model '{request.model}'.")
        if not request.product.strip() or not request.location.strip():
            raise HTTPException(status_code=422, detail="Product and location are required.")
        model = self.models.get(name)
        contract = self.contracts.get(name)
        if model is None or contract is None:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "model_unavailable",
                    "message": self.errors.get(name, f"{name} model is not loaded."),
                },
            )
        if request.horizon_days not in FORECAST_HORIZONS_DAYS:
            raise HTTPException(
                status_code=422,
                detail=f"horizon_days must be one of {list(FORECAST_HORIZONS_DAYS)}.",
            )
        if request.location not in contract["location"]:
            raise HTTPException(
                status_code=422,
                detail="The selected location is not supported by this trained model.",
            )

        unit = os.getenv("PRICE_UNIT", "").strip()
        if not unit:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "prediction_unit_missing",
                    "message": "Set PRICE_UNIT to the unit used by the trained model before predicting.",
                },
            )

        latest_date = _vietnam_today()
        observations = _prediction_history(
            product=request.product.strip(),
            location=request.location.strip(),
            unit=unit,
            contract=contract,
        )
        observations = [item for item in observations if item.date <= latest_date]
        if len(observations) < LAG_WINDOW:
            raise HTTPException(
                status_code=422,
                detail=f"At least {LAG_WINDOW} real price observations are required for the trained lag features.",
            )
        if len({item.date for item in observations}) != len(observations):
            raise HTTPException(
                status_code=422,
                detail="The selected price series contains multiple observations for the same date.",
            )
        if any(item.unit != unit for item in observations):
            raise HTTPException(
                status_code=422,
                detail=f"Historical price units must all match the configured model unit ({unit}).",
            )

        recent_observations = observations[-LAG_WINDOW:]
        sources = {item.source for item in recent_observations}
        if len(sources) != 1 or None in sources or not sources.issubset(set(contract["source"])):
            raise HTTPException(
                status_code=422,
                detail="The recent price history source does not match the model's trained source category.",
            )

        prices = [item.price for item in observations]
        forecast_dates = [
            latest_date + timedelta(days=offset)
            for offset in range(1, request.horizon_days + 1)
        ]
        target_dates = {target_date: index for index, target_date in enumerate(forecast_dates)}
        final_date = forecast_dates[-1]
        predictions_by_day: dict[int, float] = {}
        next_date = observations[-1].date + timedelta(days=1)

        try:
            while next_date <= final_date:
                features = {
                    "year": next_date.year,
                    "month": next_date.month,
                    "quarter": (next_date.month - 1) // 3 + 1,
                    "day_of_week": next_date.weekday(),
                    "day_of_year": next_date.timetuple().tm_yday,
                    "lag_1": prices[-1],
                    "lag_7": prices[-LAG_WINDOW],
                    "rolling_mean_7": sum(prices[-LAG_WINDOW:]) / LAG_WINDOW,
                    "location": request.location,
                    "source": next(iter(sources)),
                    "price_type": contract["price_type"][0],
                }
                frame = pd.DataFrame([features], columns=MODEL_FEATURES)
                predicted_price = float(model.predict(frame)[0])
                if not math.isfinite(predicted_price):
                    raise ValueError("Model returned a non-finite prediction.")
                prices.append(predicted_price)
                if next_date in target_dates:
                    predictions_by_day[target_dates[next_date]] = predicted_price
                next_date += timedelta(days=1)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Prediction failed for %s", name)
            raise HTTPException(
                status_code=502,
                detail={
                    "code": "prediction_failed",
                    "message": f"{name} model inference failed: {type(exc).__name__}: {exc}",
                },
            ) from exc

        predictions = [predictions_by_day[index] for index in range(request.horizon_days)]
        return {
            "model": name,
            "predictions": predictions,
            "unit": unit,
            "input": {
                "target": f"{request.product} · {request.location}",
                "product": request.product,
                "location": request.location,
                "horizon_days": request.horizon_days,
                "forecast_anchor_date": latest_date.isoformat(),
                "latest_csv_date": _prediction_data()["date"].max().date().isoformat(),
                "series_latest_date": observations[-1].date.isoformat(),
                "forecast_dates": [target_date.isoformat() for target_date in forecast_dates],
            },
            "actual_history": _monthly_history(observations),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }


def _monthly_history(observations: list[PriceObservation]) -> list[dict[str, Any]]:
    latest = observations[-1].date
    latest_month = latest.year * 12 + latest.month - 1
    prices_by_month = {
        item.date.year * 12 + item.date.month - 1: item.price
        for item in observations
    }
    history = []
    for period in range(latest_month - ACTUAL_HISTORY_MONTHS + 1, latest_month + 1):
        year, month_index = divmod(period, 12)
        history.append(
            {
                "month": f"{year:04d}-{month_index + 1:02d}",
                "price": prices_by_month.get(period),
            }
        )
    return history


def _vietnam_today() -> date:
    return datetime.now(VIETNAM_TIMEZONE).date()


@lru_cache(maxsize=1)
def _prediction_data() -> pd.DataFrame:
    if not PREDICTION_DATA_PATH.is_file():
        raise FileNotFoundError(f"Prediction data file not found: {PREDICTION_DATA_PATH.name}")
    required_columns = {
        "date",
        "location",
        "product_name",
        "price_type",
        "unit",
        "price_vnd",
        "source",
    }
    data = pd.read_csv(PREDICTION_DATA_PATH, encoding="utf-8-sig")
    missing_columns = required_columns.difference(data.columns)
    if missing_columns:
        raise ValueError(f"Prediction CSV is missing required columns: {sorted(missing_columns)}")
    data = data.copy()
    data["date"] = pd.to_datetime(data["date"], format="%Y-%m-%d", errors="raise")
    data["price_vnd"] = pd.to_numeric(data["price_vnd"], errors="raise")
    if data[list(required_columns)].isnull().any().any():
        raise ValueError("Prediction CSV contains empty required values.")
    if not data["price_vnd"].map(math.isfinite).all():
        raise ValueError("Prediction CSV contains non-finite prices.")
    return data


def _prediction_history(
    product: str,
    location: str,
    unit: str,
    contract: dict[str, list[str]],
) -> list[PriceObservation]:
    data = _prediction_data()
    matching = data.loc[
        (data["product_name"] == product)
        & (data["location"] == location)
        & (data["unit"] == unit)
        & data["source"].isin(contract["source"])
        & data["price_type"].isin(contract["price_type"])
    ].sort_values("date")
    if matching.empty:
        raise HTTPException(
            status_code=422,
            detail="No price history in the prediction CSV matches this product, location, unit, and model.",
        )
    if matching["date"].duplicated().any():
        raise HTTPException(
            status_code=422,
            detail="The prediction CSV contains multiple matching prices for the same date.",
        )
    return [
        PriceObservation(
            date=row.date.date(),
            price=float(row.price_vnd),
            unit=row.unit,
            source=row.source,
        )
        for row in matching.itertuples(index=False)
    ]


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
    unit = os.getenv("PRICE_UNIT", "").strip()
    models_status = registry.status()
    series_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    forecast_anchor_date = _vietnam_today()
    if unit:
        try:
            data = _prediction_data()
            latest_data_date = data["date"].max()
            for name, status in models_status.items():
                if not status["available"]:
                    continue
                supported = data.loc[
                    (data["unit"] == unit)
                    & data["location"].isin(status["locations"])
                    & data["source"].isin(status["sources"])
                    & data["price_type"].isin(status["price_types"])
                ]
                for (product, location), group in supported.groupby(
                    ["product_name", "location"], sort=False
                ):
                    ordered = group.loc[group["date"].dt.date <= forecast_anchor_date].sort_values("date")
                    if len(ordered) < LAG_WINDOW or ordered["date"].duplicated().any():
                        continue
                    key = (product, location)
                    item = series_by_key.setdefault(
                        key,
                        {
                            "product": product,
                            "location": location,
                            "models": [],
                            "horizons_days_by_model": {},
                        },
                    )
                    item["models"].append(name)
                    item["horizons_days_by_model"][name] = list(FORECAST_HORIZONS_DAYS)
                    item["forecast_anchor_date"] = forecast_anchor_date.isoformat()
                    item["latest_csv_date"] = latest_data_date.strftime("%Y-%m-%d")
                    item["series_latest_date"] = ordered["date"].iloc[-1].strftime("%Y-%m-%d")
                    item["history_months"] = int(ordered["date"].dt.to_period("M").nunique())
        except (OSError, ValueError, pd.errors.ParserError) as exc:
            logger.exception("Unable to load prediction CSV")
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "prediction_data_unavailable",
                    "message": f"Unable to read prediction data: {exc}",
                },
            ) from exc

    return {
        "models": models_status,
        "series": sorted(
            series_by_key.values(),
            key=lambda item: (item["product"].casefold(), item["location"].casefold()),
        ),
        "unit": unit or None,
        "frequency": "day",
        "horizons_days": list(FORECAST_HORIZONS_DAYS),
        "feature_names": list(MODEL_FEATURES),
    }


@app.post("/predict")
def predict(request: PredictionRequest) -> dict[str, Any]:
    return registry.predict(request)
