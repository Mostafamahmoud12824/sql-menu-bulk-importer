-- Default ERP seed for Customers Reset
-- Permanent source of truth for TblCustomer and TblCustData inserts.
-- NOTE:
--   - The application runs the required deletes + identity reset in the same
--     transaction as the seed execution.
--   - This file MUST contain all INSERT statements for TblCustomer and TblCustData.

SET NOCOUNT ON;

-- TblCustData

INSERT INTO TblCustData

(
	ID,	Cust_Name,	State_ID,	City_ID,	Loca_ID,	CustAddress,	CustPhone,	CustFax,	CustEmail,	CustVAT,	PointOK,	Point_Amount,	First_Point,	Custmap,	CustBuildNo,	CustPostBox,	CustRegNo,	CustAddNo,	Ext1,	Ext2,	Ext3,	Transfer,	Up_Date,	CustEN,	CustMOMNo,	CustAddEN,	Ident_Type,	Ident_No,	Ctry_Code,	Ctry_Name
)
VALUES
	(1,	'عميل نقدي',	11,	18,	838,	NULL,	NULL,	NULL,	NULL,	NULL,	0,	0,	0,	NULL,	1023,	2222,	NULL,	NULL,	NULL,	NULL,	NULL,	1,	0,	NULL,	NULL,	NULL,	NULL,	NULL,	NULL,	NULL);


-- TblCustomer

INSERT INTO TblCustomer
(
	ID,	CustomerName,	StateNo,	BalanceFirstDebit,	BalanceFirstCredit,	ResponsableManger,	CustomerAddress,	CustomerPhone,	CustomerFax,	BbalanceCurrent,	MAXCRDT,	EndUpgrad,	CustomerKind,	SectorNo,	info,	fpfrom2,	fpto2,	fpfrom3,	fpto3,	g18,	g19,	g20,	g21,	Transfer,	Up_Date
)
VALUES
	(1,	'عميل نقدي',	1,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2018-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(2,	'مورد نقدي',	2,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	21,	'2018-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(3,	'المرتبات',	4,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2018-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(4,	'خصم مسموح به',	4,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2018-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(5,	'حساب مبيعات',	5,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2018-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(6,	'خصم مكتسب',	3,	0,	0,	NULL,	NULL,	NULL,	NULL,	25,	0,	'2018-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(7,	'حساب مشتريات',	6,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2018-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(8,	'نقدي',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2018-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(16,	'ضريبة القيمة المضافة',	15,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2019-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(17,	'ضريبة القيمة المضافة',	13,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2019-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(18,	'شبكة',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2021-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(19,	'قسائم شراء',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2018-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(20,	'موظف2',	11,	0,	0,	NULL,	NULL,	NULL,	NULL,	15,	0,	'2018-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(21,	'موظف1',	11,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	21,	'2018-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(24,	'مدى',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2019-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(25,	'Visa',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	NULL,	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(26,	'master',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2019-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(27,	'maestro',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2019-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(28,	'Apple Pay',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	NULL,	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(29,	'STC Pay',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2019-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(30,	'هنقرستيشن',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	NULL,	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(31,	'اطلب',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	NULL,	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(32,	'وصل',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2020-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(33,	'تو يو',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2020-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(34,	'كريم',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2020-01-01 00:00:00.000',	0,	0,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(35,	'تحويلات بنكية',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	NULL,	0,	43000,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(36,	'تحويلات البنك الأهلي',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2021-01-01 00:00:00.000',	0,	43000,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0),
	(37,	'تحويلات بنك الراجحي',	8,	0,	0,	NULL,	NULL,	NULL,	NULL,	0,	0,	'2021-01-01 00:00:00.000',	0,	43000,	NULL,	0,	0,	0,	0,	0,	0,	0,	0,	1,	0);




