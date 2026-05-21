import pytest
import time
import asyncio
from src.api.auth import MockRedis

@pytest.mark.asyncio
async def test_mock_redis_setex_and_get():
    redis = MockRedis()
    
    # Set key with 1 second TTL
    await redis.setex("test_key", 1, "test_value")
    
    # Immediately check
    val = await redis.get("test_key")
    assert val == "test_value"
    
    # Sleep to allow expiration
    await asyncio.sleep(1.1)
    
    expired_val = await redis.get("test_key")
    assert expired_val is None

@pytest.mark.asyncio
async def test_mock_redis_expire():
    redis = MockRedis()
    
    # Set key without expiration initially
    redis.store["test_key"] = "test_value"
    
    # Set expire TTL to 1 second
    await redis.expire("test_key", 1)
    
    val = await redis.get("test_key")
    assert val == "test_value"
    
    # Sleep to allow expiration
    await asyncio.sleep(1.1)
    
    expired_val = await redis.get("test_key")
    assert expired_val is None

@pytest.mark.asyncio
async def test_mock_redis_list_expiry():
    redis = MockRedis()
    
    # RPUSH some list items
    await redis.rpush("test_list", "item1", "item2")
    
    # Set expire TTL to 1 second
    await redis.expire("test_list", 1)
    
    items = await redis.lrange("test_list", 0, -1)
    assert items == ["item1", "item2"]
    
    # Sleep to allow expiration
    await asyncio.sleep(1.1)
    
    expired_items = await redis.lrange("test_list", 0, -1)
    assert expired_items == []
