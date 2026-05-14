#!/bin/bash
# ==============================================================================
# Study-Hub Installation Script
# This script installs Node.js, PostgreSQL, Ollama, and configures Study-Hub.
# Supported OS: Debian/Ubuntu, Fedora/CentOS/RHEL, Arch Linux, macOS (brew).
# ==============================================================================

set -e # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check root privileges for system package installation
if [ "$EUID" -eq 0 ]; then
    print_error "Please do not run this script as root or with sudo."
    print_error "The script will prompt for sudo password when necessary."
    exit 1
fi

# Detect OS
OS_TYPE="unknown"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_TYPE=$ID
    OS_LIKE=$ID_LIKE
elif [ "$(uname)" == "Darwin" ]; then
    OS_TYPE="macOS"
fi

install_packages() {
    print_info "Detecting package manager and installing dependencies..."
    if [ "$OS_TYPE" == "macOS" ]; then
        if ! command -v brew &> /dev/null; then
            print_error "Homebrew is not installed. Please install Homebrew first."
            exit 1
        fi
        brew install node postgresql curl
    elif [[ "$OS_TYPE" == "ubuntu" || "$OS_TYPE" == "debian" || "$OS_LIKE" == *"debian"* || "$OS_LIKE" == *"ubuntu"* ]]; then
        sudo apt-get update
        sudo apt-get install -y curl git postgresql postgresql-contrib
        if ! command -v node &> /dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            sudo apt-get install -y nodejs
        fi
    elif [[ "$OS_TYPE" == "fedora" || "$OS_TYPE" == "centos" || "$OS_LIKE" == *"rhel"* || "$OS_LIKE" == *"fedora"* ]]; then
        sudo dnf install -y curl git postgresql-server postgresql-contrib nodejs
        # Initialize postgres if needed on Fedora
        if [ "$OS_TYPE" == "fedora" ]; then
            sudo postgresql-setup --initdb || true
            sudo systemctl enable --now postgresql
        fi
    elif [[ "$OS_TYPE" == "arch" || "$OS_LIKE" == *"arch"* ]]; then
        sudo pacman -Sy --noconfirm curl git postgresql nodejs npm
        sudo -u postgres initdb -D /var/lib/postgres/data || true
        sudo systemctl enable --now postgresql
    else
        print_warning "Unsupported OS/Distribution. Please install Node.js, PostgreSQL, and Git manually."
    fi
}

install_ollama() {
    if command -v ollama &> /dev/null; then
        print_success "Ollama is already installed."
    else
        print_info "Installing Ollama..."
        if [ "$OS_TYPE" == "macOS" ]; then
            brew install --cask ollama
        else
            curl -fsSL https://ollama.com/install.sh | sh
        fi
        print_success "Ollama installed."
    fi
}

setup_database() {
    print_info "Setting up PostgreSQL database and user..."
    
    DB_NAME="studyhub"
    DB_USER="studyhub_user"
    DB_PASS=$(LC_ALL=C tr -dc A-Za-z0-9 </dev/urandom | head -c 24 || true)
    
    if [ "$OS_TYPE" == "macOS" ]; then
        brew services start postgresql || true
        sleep 2
        psql postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" || true
        psql postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" || true
    else
        sudo systemctl start postgresql || sudo service postgresql start || true
        sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" || true
        sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" || true
    fi

    print_success "Database setup complete."
}

setup_env() {
    print_info "Setting up environment variables..."
    if [ ! -f ".env.example" ]; then
        print_error ".env.example not found. Are you in the project root?"
        exit 1
    fi
    
    cp .env.example .env
    
    # Generate random secrets
    JWT_SECRET=$(LC_ALL=C tr -dc A-Za-z0-9 </dev/urandom | head -c 64 || true)
    
    # Update .env file
    if [ "$OS_TYPE" == "macOS" ]; then
        sed -i '' "s/DB_NAME=studyhub/DB_NAME=$DB_NAME/g" .env
        sed -i '' "s/DB_USER=postgres/DB_USER=$DB_USER/g" .env
        sed -i '' "s/DB_PASSWORD=your_password_here/DB_PASSWORD=$DB_PASS/g" .env
        sed -i '' "s/your_super_secret_jwt_key_change_this_in_production_minimum_32_chars/$JWT_SECRET/g" .env
    else
        sed -i "s/DB_NAME=studyhub/DB_NAME=$DB_NAME/g" .env
        sed -i "s/DB_USER=postgres/DB_USER=$DB_USER/g" .env
        sed -i "s/DB_PASSWORD=your_password_here/DB_PASSWORD=$DB_PASS/g" .env
        sed -i "s/your_super_secret_jwt_key_change_this_in_production_minimum_32_chars/$JWT_SECRET/g" .env
    fi
    print_success ".env configured."
}

install_node_deps() {
    print_info "Installing Node.js dependencies..."
    npm install
    print_success "Dependencies installed."
}

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}       Study-Hub Setup Wizard                       ${NC}"
echo -e "${BLUE}====================================================${NC}"

install_packages
install_ollama
setup_database
setup_env
install_node_deps

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}                 Setup Complete!                    ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "You can now run Study-Hub."
echo -e ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "1. Download your preferred Ollama model (Optional but recommended for local AI):"
echo -e "   ${BLUE}ollama pull gemma4:4b${NC}  (or any other model)"
echo -e ""
echo -e "2. Start the application:"
echo -e "   ${BLUE}npm run dev${NC}"
echo -e ""
echo -e "3. Open your browser at: ${BLUE}http://localhost:3000${NC}"
echo -e "====================================================\n"
