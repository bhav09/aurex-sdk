import os
from app.config import Settings

def test_settings_defaults():
    # Instantiate Settings without env vars to check defaults
    # Pydantic BaseSettings might still read from .env if it exists,
    # but we can explicitly pass empty env file or override via kwargs
    settings = Settings(_env_file=None)
    
    # Check default values
    assert settings.api_host == "0.0.0.0"
    assert settings.api_port == 8000
    assert settings.debug is True
    assert "http://localhost:3000" in settings.allowed_origins
    assert settings.jwt_algorithm == "HS256"

def test_allowed_origins_parsing():
    # Simulate the logic used in main.py for parsing allowed_origins
    test_origins_str = " http://localhost:3000 , http://localhost:4000 ,  "
    settings = Settings(allowed_origins=test_origins_str, _env_file=None)
    
    origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
    assert "http://localhost:3000" in origins
    assert "http://localhost:4000" in origins
    assert len(origins) == 2
