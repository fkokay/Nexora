using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.Platform.UnitTests;

public sealed class FinancialAccountTests
{
    [Fact]
    public void Accepts_valid_cash_account_with_opening_balance()
    {
        var errors = FinancialAccountValidation.Validate(new FinancialAccountWriteRequest("KASA-01", "Merkez kasa", FinancialAccountType.Cash, "TRY", 1250.50m));

        Assert.Null(errors);
    }

    [Fact]
    public void Rejects_negative_cash_opening_balance()
    {
        var errors = FinancialAccountValidation.Validate(new FinancialAccountWriteRequest("KASA-01", "Merkez kasa", FinancialAccountType.Cash, "TRY", -1m));

        Assert.Contains("openingBalance", errors!.Keys);
    }

    [Fact]
    public void Rejects_invalid_currency_and_precision()
    {
        var errors = FinancialAccountValidation.Validate(new FinancialAccountWriteRequest("BNK-01", "Merkez banka", FinancialAccountType.Bank, "TR", 1.001m));

        Assert.Contains("currencyCode", errors!.Keys);
        Assert.Contains("openingBalance", errors.Keys);
    }

    [Fact]
    public void Validates_manual_movements_and_requires_idempotency()
    {
        var valid = new FinancialAccountMovementWriteRequest(Guid.NewGuid(), new DateOnly(2026, 10, 15), FinancialDirection.Inflow, 10m, "Kasaya nakit eklendi");
        Assert.Null(FinancialMovementValidation.Validate(valid));

        var errors = FinancialMovementValidation.Validate(valid with { RequestId = Guid.Empty, Amount = 0m, Description = " " });
        Assert.Contains("requestId", errors!.Keys);
        Assert.Contains("amount", errors.Keys);
        Assert.Contains("description", errors.Keys);
    }

    [Fact]
    public void Rejects_transfer_to_same_account_and_invalid_amount()
    {
        var accountId = Guid.NewGuid();
        var request = new FinancialAccountTransferWriteRequest(Guid.NewGuid(), accountId, accountId, new DateOnly(2026, 10, 15), 0m);

        var errors = FinancialMovementValidation.Validate(request);

        Assert.Contains("toAccountId", errors!.Keys);
        Assert.Contains("amount", errors.Keys);
    }

    [Fact]
    public void Accepts_foreign_currency_transfer_with_eight_decimal_exchange_rate()
    {
        var request = new FinancialAccountTransferWriteRequest(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            new DateOnly(2026, 10, 15), 100m, ExchangeRate: 42.12345678m);

        Assert.Null(FinancialMovementValidation.Validate(request));
    }

    [Fact]
    public void Rejects_invalid_exchange_rate_precision_and_value()
    {
        var request = new FinancialAccountTransferWriteRequest(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            new DateOnly(2026, 10, 15), 100m, ExchangeRate: 0m);
        Assert.Contains("exchangeRate", FinancialMovementValidation.Validate(request)!.Keys);

        request = request with { ExchangeRate = 42.123456789m };
        Assert.Contains("exchangeRate", FinancialMovementValidation.Validate(request)!.Keys);
    }

    [Fact]
    public void Validates_bank_statement_period_and_balance_reconciliation()
    {
        var request = new BankStatementImportRequest(Guid.NewGuid(), new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 31),
            100m, 85m,
            [new BankStatementLineImportRequest(new DateOnly(2026, 10, 2), 25m, "Müşteri tahsilatı", ExternalId: "TX-1"),
             new BankStatementLineImportRequest(new DateOnly(2026, 10, 3), -40m, "Banka masrafı", ExternalId: "TX-2")]);

        Assert.Null(BankStatementValidation.Validate(request));
        var errors = BankStatementValidation.Validate(request with { ClosingBalance = 84m });
        Assert.Contains("closingBalance", errors!.Keys);
    }

    [Fact]
    public void Rejects_duplicate_bank_external_ids_and_out_of_period_lines()
    {
        var day = new DateOnly(2026, 10, 1);
        var request = new BankStatementImportRequest(Guid.NewGuid(), day, day, 0m, 2m,
            [new BankStatementLineImportRequest(day, 1m, "Bir", ExternalId: "SAME"),
             new BankStatementLineImportRequest(day.AddDays(1), 1m, "İki", ExternalId: "same")]);

        var errors = BankStatementValidation.Validate(request);

        Assert.Contains("lines[1].externalId", errors!.Keys);
        Assert.Contains("lines[1].transactionDate", errors.Keys);
    }
}
