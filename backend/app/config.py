from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    model_config = {
        "env_prefix": "",
        "case_sensitive": False,
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "allow"
    }
    
    # API configuration
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000)
    debug: bool = Field(default=True)
    
    # Security Configuration
    allowed_origins: str = Field(
        default="http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001,https://heyaurex.com,https://www.heyaurex.com"
    )
    jwt_secret: str = Field(default="dev-secret-key-change-in-prod")
    jwt_algorithm: str = Field(default="HS256")
    jwt_expiration_minutes: int = Field(default=10080)  # 7 days

    # External APIs
    resend_api_key: str = Field(default="")

    # OAuth Configuration
    google_oauth_client_id: str = Field(default="")
    github_oauth_client_id: str = Field(default="")
    github_oauth_client_secret: str = Field(default="")
    frontend_url: str = Field(default="http://localhost:3000")

    # Google Cloud Configuration
    google_application_credentials: str = Field(default="/Users/bhavishya/VSC Projects/tbank/aurex-495417-8ed2dc84792c.json")

settings = Settings()
