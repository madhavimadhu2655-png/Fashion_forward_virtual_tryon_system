"""
Shared across all test files. Previously test_products.py and
test_auth.py each set their own `app.dependency_overrides[get_db]` at
module level — since both target the same FastAPI `app` singleton, the
override set by whichever file was imported LAST silently won for both
files, and its tables weren't created yet when the other file's tests
ran first. Centralizing the engine/override/table-creation here in one
autouse, session-scoped fixture fixes that.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.session import get_db
from app.models.product import Base, Product, ProductImage, ProductVariant, ProductSize, GarmentAsset
from app.seed_data import build_seed_rows

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db


@pytest.fixture(scope="session", autouse=True)
def _setup_database():
    """Creates tables AND seeds product data once for the whole test
    session — every test file needs the tables, and several (products,
    garment-assets) need the seeded products. Previously the seeding
    lived only in test_products.py as its own module-scoped fixture,
    which meant any OTHER test file collected before it alphabetically
    (test_garment_assets.py, in this case) ran against an empty
    products table and got spurious 404s. Centralizing here fixes that
    the same way the dependency-override fix did in Milestone 3."""
    Base.metadata.create_all(bind=engine)

    db = TestSessionLocal()
    products, images, variants, sizes, garment_assets, _photo_missing, _garment_missing = build_seed_rows()
    db.bulk_insert_mappings(Product, products)
    db.bulk_insert_mappings(ProductImage, images)
    db.bulk_insert_mappings(ProductVariant, variants)
    db.bulk_insert_mappings(ProductSize, sizes)
    db.bulk_insert_mappings(GarmentAsset, garment_assets)
    db.commit()
    db.close()

    yield
    Base.metadata.drop_all(bind=engine)
