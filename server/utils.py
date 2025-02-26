import numpy as np

def replace_nan_with_none(data):
    """Recursively replace NaN with None in a nested data structure."""
    if isinstance(data, list):
        return [replace_nan_with_none(item) for item in data]
    elif isinstance(data, dict):
        return {key: replace_nan_with_none(value) for key, value in data.items()}
    elif isinstance(data, float) and (np.isnan(data) or np.isinf(data)):
        return None
    return data
