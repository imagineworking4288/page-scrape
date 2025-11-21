"""
Rate limiting for polite scraping.
"""

import time
import random
import logging
from typing import Callable, Any, Optional


class RateLimiter:
    """Rate limiter with exponential backoff support."""

    def __init__(
        self,
        min_delay: int = 2000,
        max_delay: int = 5000,
        logger: Optional[logging.Logger] = None
    ):
        """
        Initialize rate limiter.

        Args:
            min_delay: Minimum delay in milliseconds
            max_delay: Maximum delay in milliseconds
            logger: Logger instance
        """
        self.min_delay = min_delay / 1000.0  # Convert to seconds
        self.max_delay = max_delay / 1000.0
        self.last_request_time: Optional[float] = None
        self.logger = logger or logging.getLogger(__name__)

    def wait(self) -> None:
        """Wait with random delay between min and max."""
        delay = random.uniform(self.min_delay, self.max_delay)

        # Add jitter for human-like behavior
        jitter = random.uniform(-0.2, 0.2) * delay
        total_delay = max(0, delay + jitter)

        if self.last_request_time:
            # Ensure minimum delay since last request
            elapsed = time.time() - self.last_request_time
            if elapsed < total_delay:
                time.sleep(total_delay - elapsed)
        else:
            time.sleep(total_delay)

        self.last_request_time = time.time()

    def retry_with_backoff(
        self,
        func: Callable,
        max_retries: int = 3,
        *args,
        **kwargs
    ) -> Any:
        """
        Retry function with exponential backoff.

        Args:
            func: Function to retry
            max_retries: Maximum number of retries
            *args: Positional arguments for func
            **kwargs: Keyword arguments for func

        Returns:
            Function result

        Raises:
            Last exception if all retries fail
        """
        last_exception = None

        for attempt in range(max_retries):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                if attempt < max_retries - 1:
                    # Exponential backoff: 2^attempt seconds
                    backoff_time = 2 ** attempt
                    self.logger.warning(
                        f"Attempt {attempt + 1} failed: {e}. "
                        f"Retrying in {backoff_time}s..."
                    )
                    time.sleep(backoff_time)
                else:
                    self.logger.error(f"All {max_retries} attempts failed")

        raise last_exception
