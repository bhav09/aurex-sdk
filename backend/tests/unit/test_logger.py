import pytest
from src.utils.logger import get_logger

class TestLoggerUtils:
    def test_get_logger(self):
        logger = get_logger("test_logger")
        assert logger is not None
        assert logger.name == "test_logger"
