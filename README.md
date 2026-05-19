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
