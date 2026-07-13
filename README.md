# SQL Menu Bulk Importer
A modern desktop/web application for importing customer data into Microsoft SQL Server, managing system feature activation, and handling database configuration through an intuitive user interface.
---
## Features
### Customer Import
- Import customers from Excel (.xlsx)
- Bulk insert into SQL Server
- Import progress tracking
- Detailed import logs
- Error reporting
- Validation before import
### Database Connection
- SQL Server connection configuration
- Database selection
- Windows Authentication
- SQL Server Authentication
- Connection testing
### Feature Activation
- Enable or disable system features
- Feature status management
- Persistent configuration
- Independent Feature Activation page
Supported features include:
- Customer Points
- ZATCA Integration
- Product Barcode
- Warehouses & Stores
- Accounting Entries
### User Interface
- Modern responsive design
- Arabic & English support
- Dark Mode
- Light Mode
- Clean dashboard
- Real-time status updates
---
## Technologies
### Backend
- Node.js
- Express.js
- MSSQL
- XLSX
- JavaScript
### Frontend
- HTML5
- CSS3
- JavaScript (Vanilla)
### Database
- Microsoft SQL Server
---
## Project Structure
```
sql-menu-bulk-importer/
│
├── public/
│   ├── css/
│   ├── js/
│   ├── images/
│   └── index.html
│
├── server/
│   ├── routes/
│   ├── services/
│   ├── controllers/
│   └── config/
│
├── scripts/
│
├── sql/
│
├── uploads/
│
├── server.js
├── package.json
└── README.md
```
---
## Installation
Clone the repository
```bash
git clone https://github.com/Mostafamahmoud12824/sql-menu-bulk-importer.git
```
Go to project
```bash
cd sql-menu-bulk-importer
```
Install dependencies
```bash
npm install
```
Run the application
```bash
npm start
```
or
```bash
node server.js
```
---
## Configuration
Configure SQL Server connection before importing customers.
Example:
```
Server
Database
Username
Password
Authentication Type
```
---
## Import Workflow
1. Connect to SQL Server.
2. Select the target database.
3. Upload an Excel file.
4. Validate customer data.
5. Import records.
6. Review logs.
7. Export logs if required.
---
## Supported Excel Format
The application supports importing customer information including:
- Customer Name
- Address
- Phone
- Email
- Tax Number
- City
- State
- Location
- Credit Limits
- Customer Type
---
## Screenshots
Add screenshots here.
```
/docs/images/dashboard.png
/docs/images/customer-import.png
/docs/images/feature-activation.png
```
---
## Roadmap
- Image Downloader
- OCR Menu Import
- Automatic Column Mapping
- Import History
- Backup & Restore
- Multi-language Improvements
- User Permissions
- Audit Logs
---
## Requirements
- Node.js 18+
- SQL Server 2012+
- Windows 10/11
---
## License
MIT License
---
## Author
**Mostafa Mahmoud**
Software Engineer
[![GitHub](https://img.shields.io/badge/GitHub-Mostafamahmoud12824-181717?style=for-the-badge&logo=github)](https://github.com/Mostafamahmoud12824)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Mostafa%20Mahmoud-0A66C2?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/mostafa-mahmoud-salah-1234567d89/)
---
## Version
Current Version
**v3.0**
