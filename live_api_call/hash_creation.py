import hashlib
from datetime import datetime, timezone

def compute_sha256_hash(input_string: str) -> str:
    """Equivalent to the given C# ComputeSha256Hash method."""
    sha256_hash = hashlib.sha256(input_string.encode("utf-8")).hexdigest()
    return sha256_hash.lower()  # ensure lowercase hex, like C#


def generate_access_token(username: str, plain_password: str, pwd_secret_key: str):
    # Step 1: Compute SHA256 hash of plain password
    step1 = compute_sha256_hash(plain_password)

    # Step 2: Generate timestamp in C# format (yyyyMMddHHmmss, UTC)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

    # Step 3: Concatenate Step1 + Timestamp
    step3 = step1 + timestamp

    # Step 4: Compute SHA256 hash of Step3
    step4 = compute_sha256_hash(step3)

    # Step 5: Concatenate Step4 + SecretKey
    step5 = step4 + pwd_secret_key

    # Step 6: Compute SHA256 hash of Step5 → Final AccessToken
    access_token = compute_sha256_hash(step5)

    return {
        "Username": username,
        "Timestamp": timestamp,
        "AccessToken": access_token
    }


# Example usage
if __name__ == "__main__":
    username = "UserJP"
    plain_password = "29#@JP25bhaV"
    pwd_secret_key = "bam5kllfzjzvjv560s5q24fnwbtqs50d"

    result = generate_access_token(username, plain_password, pwd_secret_key)

    print("Username     :", result["Username"])
    print("Timestamp    :", result["Timestamp"])
    print("Access Token :", result["AccessToken"])

