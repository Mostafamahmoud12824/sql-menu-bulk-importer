# Afaq Importer

Professional Excel to SQL Server Importer built with Node.js, Express, SQL Server, and XLSX.

## Features

- Excel bulk import
- SQL Server & LocalDB support
- Real-time import progress
- Auto Arabic → English translation
- Main/Sub category hierarchy support
- Item ordering support
- Modern dark UI
- Live logs system
- Automatic Excel template download
- Fast batch processing
- Smart connection management
- Secure connection locking after successful login

---
## Dashboard

Modern importer interface with:

- Database connection panel
- Excel upload system
- Live operation logs
- Data preview table
- Import statistics
- Real-time progress updates

---

# Technologies Used

- Node.js
- Express.js
- SQL Server
- mssql
- msnodesqlv8
- XLSX
- Multer
- Google Translate API
- Vanilla JavaScript
- HTML5
- CSS3

---
# Database Connection Notes

## SQL Server Remote Connection Requirements

Before connecting the application to a remote SQL Server, make sure the following requirements are configured correctly.

---

## 1. Enable TCP/IP in SQL Server

The SQL Server instance must allow remote TCP/IP connections.

### Steps

1. Open **SQL Server Configuration Manager**
2. Go to:

```txt
SQL Server Network Configuration
```

3. Select:

```txt
Protocols for SQLEXPRESS
```

4. Enable:

```txt
TCP/IP
```

5. Restart SQL Server service

---

## 2. Open Windows Firewall Port

The SQL Server port must be allowed through Windows Firewall.

### Default SQL Server Port

```txt
1433
```

### Required Action

Create an inbound firewall rule for:

```txt
TCP Port 1433
```

---

## 3. Correct Server Address

When connecting remotely, the application must use a valid server address.

### Examples

#### Local Network IP

```txt
192.168.1.10
```

#### SQL Server Instance

```txt
DESKTOP-ABC\SQLEXPRESS
```

#### Domain Address

```txt
sql.example.com
```

---

## 4. Authentication

The application supports:

- SQL Server Authentication
- Windows Authentication / LocalDB

### Example SQL Login

```txt
Username: sa
Password: your_password
```

---

## 5. Password Changes

If the SQL Server password changes, the connection will fail until the new password is updated.

### Common Error

```txt
Login failed for user
```

### Solution

Update the connection credentials inside the application.

---

## 6. Recommended Security Practices

For production environments, avoid hardcoding credentials directly in source code.

### Recommended Options

- `.env` files
- Encrypted configuration storage
- Environment variables
- Secure secrets management systems

---

## 7. Connection Validation

The application validates the database connection before starting import operations.

If the connection fails, an error message will be returned immediately.

---

# Installation

## 1. Clone Repository

```bash
git clone https://github.com/Mostafamahmoud12824/afaq-importer.git
```
2. Open Project
cd afaq-importer
3. Install Packages
npm install
4. Run Project
node server.js
Open Browser
http://localhost:3000
Required Packages
npm install express multer xlsx mssql msnodesqlv8 google-translate-api-x
Excel Template Structure
Column	Description
Main Group ID	Main category ID
Main Group Arabic	Arabic main category
Main Group English	English main category
Sub Group ID	Sub category ID
Item Order	Item ترتيب داخل المجموعة
Sub Group Arabic	Arabic sub category
Sub Group English	English sub category
Product Arabic	Arabic product name
Product English	English product name
Price	Product price
Supported Database Types
SQL Server
SQL LocalDB
Features Overview
Smart Translation Cache

Avoids duplicate translation requests for maximum speed.

Real-Time Import Logs

Track every import operation live from the UI.

Secure Connection Mode

Database credentials become locked after successful connection.

High-Speed Import Engine

Optimized SQL operations for large Excel files.

Project Structure
afaq-importer/
│
├── server.js
├── index.html
├── package.json
├── uploads/
├── translated_output.xlsx
├── rgb_full_import_template.xlsx
└── README.md
Author

Mostafa Mahmoud

Software Engineer
Faculty of Computers and Information - Fayoum University

License

MIT License

# Screenshots
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/9795ab79-f8f9-4b8d-87b6-b7850b7a0bdf" />
