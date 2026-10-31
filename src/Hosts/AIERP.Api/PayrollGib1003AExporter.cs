using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using System.Xml.Schema;
using AIERP.Platform.Domain;

public sealed record PayrollGib1003ARequest(
    string TaxOfficeCode,
    string TaxNumber,
    string EmployerTitle,
    string PhoneAreaCode,
    string PhoneNumber,
    string BranchNumber,
    string FutureDeclarationFlag,
    IReadOnlyList<PayrollGib1003AWithholdingLine> WithholdingLines,
    IReadOnlyList<PayrollGib1003AEmployeeLine> Employees);

public sealed record PayrollGib1003AEmployerProfile(string TaxOfficeCode, string TaxNumber, string EmployerTitle,
    string PhoneAreaCode, string PhoneNumber, string BranchNumber);

public sealed record PayrollGib1003AWithholdingLine(string Code, decimal GrossAmount, decimal WithheldAmount);

public sealed record PayrollGib1003AEmployeeLine(
    Guid EmployeeId,
    string DocumentNature,
    string DocumentType,
    string LawCode,
    string NewUnitCode,
    string OldUnitCode,
    string WorkplaceSerialNumber,
    string ProvinceCode,
    string SubcontractorNumber,
    string NationalIdentityNumber,
    string FirstName,
    string LastName,
    int PremiumDays,
    decimal EarnedWage,
    decimal BonusAndPremium,
    string ProfessionCode,
    string RestReportWorkFlag,
    string AccrualReasonCode,
    decimal IncomeTaxBase,
    decimal CalculatedIncomeTax,
    decimal MinimumWageIncomeTaxExemption,
    decimal IncomeTaxWithheld,
    decimal MinimumWageStampTaxExemption,
    decimal StampTaxWithheld);

public static class PayrollGib1003AExporter
{
    private const string SchemaFolder = "schemas/gib/ebeyanname-v133-2026-10-02";
    private const string SchemaFile = "MUHSGK_21.xsd";

    public static bool TryBuild(PayrollRunSnapshot run, PayrollRunCalculation calculation,
        PayrollFormulaResultEnvelope envelope, PayrollGib1003ARequest request,
        out byte[] xmlBytes, out IReadOnlyList<string> errors)
    {
        xmlBytes = [];
        var issues = new List<string>();
        if (run.PeriodKind != "CalendarMonth" || run.PeriodStart.Day != 1 ||
            run.PeriodEnd != run.PeriodStart.AddMonths(1).AddDays(-1))
            issues.Add("1003A payroll declaration requires a full calendar month.");
        if (calculation.Status != "Finalized" || envelope.RunId != run.Id ||
            envelope.RunSnapshotSha256 != run.SnapshotSha256 || calculation.RunSnapshotSha256 != run.SnapshotSha256)
            issues.Add("A hash-verified finalized result for this exact run is required; current result remains an internal formula result.");
        if (!Digits(request.TaxOfficeCode, 6) || !NonZeroDigits(request.TaxOfficeCode, 6) ||
            !Digits(request.TaxNumber, 10) || !NonZeroDigits(request.TaxNumber, 10) ||
            string.IsNullOrWhiteSpace(request.EmployerTitle) || request.EmployerTitle.Length > 80 ||
            !Digits(request.PhoneAreaCode, 3) || !Digits(request.PhoneNumber, 7) ||
            request.BranchNumber is null || request.BranchNumber.Length > 10 ||
            request.FutureDeclarationFlag is not ("1" or "2"))
            issues.Add("Employer tax office, VKN, title, contact phone, branch number and future-declaration flag must be supplied in valid form.");
        if (request.Employees is null || request.Employees.Count == 0 || request.Employees.Count > 500 ||
            request.Employees.Select(x => x.EmployeeId).Distinct().Count() != request.Employees.Count ||
            !request.Employees.Select(x => x.EmployeeId).Order().SequenceEqual(envelope.Employees.Select(x => x.EmployeeId).Order()))
            issues.Add("Declaration employee rows must match the finalized run employee set exactly, without duplicates.");
        if (request.WithholdingLines is null || request.WithholdingLines.Count == 0 || request.WithholdingLines.Count > 256 ||
            request.WithholdingLines.Any(x => !Code(x.Code) || !Amount(x.GrossAmount) || !Amount(x.WithheldAmount) || x.WithheldAmount > x.GrossAmount))
            issues.Add("At least one valid tax-withholding line is required; codes and amounts must be verified against the tenant's approved declaration mapping.");
        foreach (var employee in request.Employees ?? [])
        {
            if (employee.EmployeeId == Guid.Empty || employee.DocumentNature is not ("A" or "E" or "I") ||
                !Code(employee.DocumentType) || !Digits(employee.LawCode, 5) ||
                !Digits(employee.NewUnitCode, 2) || !Digits(employee.OldUnitCode, 2) ||
                !Digits(employee.WorkplaceSerialNumber, 7) || !Digits(employee.ProvinceCode, 2) ||
                !Digits(employee.SubcontractorNumber, 3) || !Digits(employee.NationalIdentityNumber, 11) ||
                !NonZeroDigits(employee.NationalIdentityNumber, 11) ||
                string.IsNullOrWhiteSpace(employee.FirstName) || employee.FirstName.Length > 100 ||
                string.IsNullOrWhiteSpace(employee.LastName) || employee.LastName.Length > 100 ||
                employee.PremiumDays is < 0 or > 90 || !Amount(employee.EarnedWage) || !Amount(employee.BonusAndPremium) ||
                !Amount(employee.IncomeTaxBase) || !Amount(employee.CalculatedIncomeTax) ||
                !Amount(employee.MinimumWageIncomeTaxExemption) || !Amount(employee.IncomeTaxWithheld) ||
                !Amount(employee.MinimumWageStampTaxExemption) || !Amount(employee.StampTaxWithheld) ||
                !System.Text.RegularExpressions.Regex.IsMatch(employee.ProfessionCode ?? "", "^[0-9]{4}\\.[0-9]{2}$") ||
                !Code(employee.RestReportWorkFlag) || !Code(employee.AccrualReasonCode))
                issues.Add($"Employee {employee.EmployeeId:D} is missing valid GİB/SGK declaration fields or has out-of-range amounts.");
        }
        if (issues.Count > 0) { errors = issues; return false; }

        var period = run.PeriodStart;
        static XElement E(string name, object? value) => new(name, Convert.ToString(value, CultureInfo.InvariantCulture) ?? "");
        var employeeRows = new XElement("sgkCalisanBilgileri", request.Employees!.Select(employee =>
        {
            var row = new XElement("sgkCalisanBilgisi",
                E("belgeMahiyet", employee.DocumentNature), E("belgeTuru", employee.DocumentType),
                E("kanun", employee.LawCode), E("isyeriYeniSubeKod", employee.NewUnitCode),
                E("isyeriEskiSubeKod", employee.OldUnitCode), E("isyeriSiraNo", employee.WorkplaceSerialNumber),
                E("isyeriIlKod", employee.ProvinceCode), E("isyeriAraciSiraNo", employee.SubcontractorNumber),
                E("tckno", employee.NationalIdentityNumber), E("ad", employee.FirstName), E("soyad", employee.LastName),
                E("gun", employee.PremiumDays), E("hakEdilenUcret", employee.EarnedWage),
                E("primIkramiye", employee.BonusAndPremium), E("rapCalisti", employee.RestReportWorkFlag),
                E("tahakkukNeden", employee.AccrualReasonCode), E("hizmetAy", period.Month), E("hizmetYil", period.Year),
                E("ilgiliDonemGvMatrah", employee.IncomeTaxBase), E("hgv", employee.CalculatedIncomeTax),
                E("aUIstisnaGV", employee.MinimumWageIncomeTaxExemption), E("gvKesinti", employee.IncomeTaxWithheld),
                E("aUIstisnaDV", employee.MinimumWageStampTaxExemption), E("damgaVKesinti", employee.StampTaxWithheld));
                            row.Add(E("meslekKod", employee.ProfessionCode));
            return row;
        }));
        var xml = new XDocument(new XDeclaration("1.0", "UTF-8", null),
            new XElement("beyanname", new XAttribute("kodVer", "MUHSGK_21"),
                new XElement("genel",
                    new XElement("idari",
                        E("vdKodu", request.TaxOfficeCode),
                        new XElement("donem", E("tip", "aylik"), E("yil", period.Year), E("ay", period.Month))),
                    new XElement("mukellef", E("vergiNo", request.TaxNumber), E("soyadi", request.EmployerTitle),
                        E("alanKodu", request.PhoneAreaCode), E("telNo", request.PhoneNumber))),
                new XElement("ozel",
                    E("subeNo", request.BranchNumber),
                    E("beyanimVarYok", request.FutureDeclarationFlag),
                    new XElement("matrahBildirimleri", request.WithholdingLines!.Select(line =>
                        new XElement("matrahBildirimi", E("turKodu", line.Code), E("gayrisafiTutar", line.GrossAmount), E("kesintiTutari", line.WithheldAmount)))),
                    E("toplamGayrisafiTutar", request.WithholdingLines!.Sum(x => x.GrossAmount)),
                    E("toplamKesintiTutari", request.WithholdingLines!.Sum(x => x.WithheldAmount)),
                    new XElement("sgkBildirgeleri", employeeRows))));

        var schemaPath = Path.Combine(AppContext.BaseDirectory, SchemaFolder.Replace('/', Path.DirectorySeparatorChar), SchemaFile);
        var validationErrors = Validate(xml, schemaPath);
        if (validationErrors.Count > 0) { errors = validationErrors; return false; }
        using var stream = new MemoryStream();
        using (var writer = XmlWriter.Create(stream, new XmlWriterSettings { Encoding = new UTF8Encoding(false), Indent = true, OmitXmlDeclaration = false }))
            xml.Save(writer);
        xmlBytes = stream.ToArray();
        errors = [];
        return true;
    }

    private static List<string> Validate(XDocument xml, string schemaPath)
    {
        var errors = new List<string>();
        var schemas = new XmlSchemaSet { XmlResolver = new XmlUrlResolver() };
        schemas.Add(null, schemaPath);
        schemas.Compile();
        xml.Validate(schemas, (_, args) => errors.Add(args.Message));
        return errors;
    }

    private static bool Digits(string? value, int length) => value is { Length: var actual } && actual == length && value.All(char.IsAsciiDigit);
    private static bool NonZeroDigits(string? value, int length) => Digits(value, length) && value!.Any(digit => digit != '0');
    private static bool Code(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 20 && value.Trim() == value;
    private static bool Amount(decimal value) => value >= 0m && decimal.Round(value, 2) == value;
}
