const sql = require("mssql/msnodesqlv8");
const XLSX = require("xlsx");

const config = {
    server: "(localdb)\\RGBDB",
    database: "data2025",
    driver: "msnodesqlv8",
    options: {
        trustedConnection: true,
        trustServerCertificate: true
    }
};

async function importCustomers() {
    let pool;

    try {
        pool = await sql.connect(config);

        console.log("✅ Connected to SQL Server");

        const workbook = XLSX.readFile("customers.xlsx");
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const customers = XLSX.utils.sheet_to_json(sheet);

        console.log(`📄 ${customers.length} customers found.`);

        for (const customer of customers) {

            const transaction = new sql.Transaction(pool);

            try {

                await transaction.begin();

                // الحصول على ID جديد
                const idRequest = new sql.Request(transaction);

                const idResult = await idRequest.query(`
                    SELECT ISNULL(MAX(ID), 0) + 1 AS NewID
                    FROM TblCustomer
                `);

                const id = idResult.recordset[0].NewID;

                const customerName = customer.CustomerName || "";
                const phone = customer.Phone || "";
                const vat = customer.VAT || "";

                // إدراج في TblCustomer
                const customerRequest = new sql.Request(transaction);

                await customerRequest
                    .input("ID", sql.Int, id)
                    .input("CustomerName", sql.NVarChar(255), customerName)
                    .input("Phone", sql.NVarChar(50), phone)
                    .input("VAT", sql.NVarChar(255), vat)
                    .query(`
                        INSERT INTO TblCustomer
                        (
                            ID,
                            CustomerName,
                            StateNo,
                            CustomerPhone,
                            info,
                            Transfer
                        )
                        VALUES
                        (
                            @ID,
                            @CustomerName,
                            1,
                            @Phone,
                            @VAT,
                            1
                        )
                    `);

                // إدراج في TblCustData
                const custDataRequest = new sql.Request(transaction);

                await custDataRequest
                    .input("ID", sql.Int, id)
                    .input("CustName", sql.NVarChar(255), customerName)
                    .input("CustPhone", sql.NVarChar(50), phone)
                    .input("CustVAT", sql.NVarChar(255), vat)
                    .query(`
                        INSERT INTO TblCustData
                        (
                            ID,
                            Cust_Name,
                            CustPhone,
                            CustVAT,
                            Transfer,
                            PointOK,
                            Point_Amount,
                            First_Point
                        )
                        VALUES
                        (
                            @ID,
                            @CustName,
                            @CustPhone,
                            @CustVAT,
                            1,
                            0,
                            0,
                            0
                        )
                    `);

                await transaction.commit();

                console.log(`✅ Added: ${customerName}`);

            } catch (err) {

                await transaction.rollback();

                console.log(`❌ ${customer.CustomerName}`);
                console.log(err);
            }
        }

        console.log("🎉 Import Finished");

    } catch (err) {

        console.log(err);

    } finally {

        if (pool) {
            await pool.close();
        }

    }
}

importCustomers();