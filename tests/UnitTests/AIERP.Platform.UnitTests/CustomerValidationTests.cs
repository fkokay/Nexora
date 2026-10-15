using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.Platform.UnitTests;

public sealed class CustomerValidationTests
{
    [Theory]
    [InlineData(CounterpartyType.Customer)]
    [InlineData(CounterpartyType.Supplier)]
    [InlineData(CounterpartyType.Both)]
    public void Accepts_valid_customer_account(CounterpartyType type)
    {
        var errors = CustomerValidation.Validate(new CustomerWriteRequest("C-001", "Example Ltd", type, "1234567890"));
        Assert.Null(errors);
    }

    [Fact]
    public void Rejects_missing_code_and_name()
    {
        var errors = CustomerValidation.Validate(new CustomerWriteRequest("  ", "", CounterpartyType.Customer, null));
        Assert.NotNull(errors);
        Assert.Contains("code", errors.Keys);
        Assert.Contains("name", errors.Keys);
    }

    [Fact]
    public void Rejects_undefined_type()
    {
        var errors = CustomerValidation.Validate(new CustomerWriteRequest("C-001", "Example Ltd", (CounterpartyType)99, null));
        Assert.NotNull(errors);
        Assert.Contains("type", errors.Keys);
    }

    [Fact]
    public void Rejects_values_that_exceed_storage_limits()
    {
        var errors = CustomerValidation.Validate(new CustomerWriteRequest(
            new string('C', 65), new string('N', 201), CounterpartyType.Customer, new string('1', 33)));
        Assert.NotNull(errors);
        Assert.Contains("code", errors.Keys);
        Assert.Contains("name", errors.Keys);
        Assert.Contains("taxNumber", errors.Keys);
    }

    [Fact]
    public void Rejects_invalid_currency_and_financial_terms()
    {
        var errors = CustomerValidation.Validate(new CustomerWriteRequest(
            "C-001", "Example Ltd", CounterpartyType.Customer, null, CurrencyCode: "EU1", RiskLimit: -1, PaymentTermDays: 3651));

        Assert.NotNull(errors);
        Assert.Contains("currencyCode", errors.Keys);
        Assert.Contains("riskLimit", errors.Keys);
        Assert.Contains("paymentTermDays", errors.Keys);
    }

    [Fact]
    public void Accepts_valid_customer_address()
    {
        var errors = CustomerAddressValidation.Validate(new CustomerAddressWriteRequest(
            CustomerAddressKind.Billing, "Head office", "Main Street 1", "Istanbul", "Kadikoy", "34710", "TR", true));

        Assert.Null(errors);
    }

    [Fact]
    public void Rejects_invalid_customer_address_fields()
    {
        var errors = CustomerAddressValidation.Validate(new CustomerAddressWriteRequest(
            (CustomerAddressKind)9, "", "", "", null, null, "TUR"));

        Assert.NotNull(errors);
        Assert.Contains("kind", errors.Keys);
        Assert.Contains("label", errors.Keys);
        Assert.Contains("addressLine", errors.Keys);
        Assert.Contains("city", errors.Keys);
        Assert.Contains("countryCode", errors.Keys);
    }

    [Fact]
    public void Validates_ledger_amount_and_direction()
    {
        var errors = CustomerLedgerValidation.Validate(new CustomerLedgerWriteRequest(
            DateOnly.FromDateTime(DateTime.UtcNow), (CustomerLedgerDirection)8, 0, "TRY", ""));

        Assert.NotNull(errors);
        Assert.Contains("direction", errors.Keys);
        Assert.Contains("amount", errors.Keys);
        Assert.Contains("description", errors.Keys);
    }

    [Theory]
    [InlineData(125, 25, 100, "Debit")]
    [InlineData(25, 125, -100, "Credit")]
    [InlineData(50, 50, 0, "Balanced")]
    public void Calculates_signed_customer_balance(decimal debit, decimal credit, decimal expected, string side)
    {
        var result = CustomerLedgerBalanceCalculator.Calculate("TRY", debit, credit, 1000m);

        Assert.Equal(expected, result.Balance);
        Assert.Equal(side, result.BalanceSide);
        Assert.Equal(1000m, result.RiskLimit);
    }
}
