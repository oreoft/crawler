"""Entry point for the content mirror service."""

import os
import uvicorn


def main():
    """Run the server."""
    port = int(os.environ.get("PORT", "3001"))
    
    uvicorn.run(
        "crawlers.server:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()

