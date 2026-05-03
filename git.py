import subprocess
import os

# Configuration
REPO_URL = "https://github.com/Shadowknaz/dun1bit.git"
TOKEN = "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"
GIT_PATH = r"C:\Program Files\Git\bin\git.exe"

def run_git_command(args):
    try:
        # Use the absolute path to git.exe since it's not in the system PATH
        command = [GIT_PATH] + args
        print(f"Running: {' '.join(command)}")
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error: {e.stderr}")
        return False

def main():
    # Ensure git is initialized (it should be already)
    if not os.path.exists(".git"):
        print("Initializing git repository...")
        run_git_command(["init"])

    # Prepare URL with authentication
    # Format: https://<username>:<token>@github.com/<owner>/<repo>.git
    auth_url = REPO_URL.replace("https://", f"https://Shadowknaz:{TOKEN}@")

    # Add remote
    print("Adding remote...")
    # Try to remove if exists
    subprocess.run([GIT_PATH, "remote", "remove", "origin"], capture_output=True)
    if not run_git_command(["remote", "add", "origin", auth_url]):
        return

    # Add files and commit
    print("Adding files...")
    run_git_command(["add", "."])
    
    # Check if there are changes to commit
    print("Committing...")
    # This might fail if nothing to commit, so we don't strictly check
    subprocess.run([GIT_PATH, "commit", "-m", "Upload project to GitHub"], capture_output=True)

    # Push to GitHub
    print("Pushing to GitHub...")
    # Using -u origin main
    if run_git_command(["push", "-u", "origin", "master", "--force"]):
        print("\nSuccess! Project uploaded to https://github.com/Shadowknaz/balliard")
    else:
        # Try 'main' branch if 'master' fails
        print("Trying 'main' branch...")
        if run_git_command(["push", "-u", "origin", "main", "--force"]):
             print("\nSuccess! Project uploaded to https://github.com/Shadowknaz/balliard")
        else:
            print("\nFailed to push. Please check your token and repository permissions.")

if __name__ == "__main__":
    main()
