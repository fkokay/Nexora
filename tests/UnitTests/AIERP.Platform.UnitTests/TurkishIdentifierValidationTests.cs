using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.Platform.UnitTests;

// All identifiers are synthetic values computed to satisfy (or deliberately break) the check-digit rules.
public sealed class TurkishIdentifierValidationTests
{
    [Theory]
    [InlineData("1234567890")]
    [InlineData("9876543217")]
    [InlineData("1111111114")]
    [InlineData("0000000019")]
    public void Accepts_valid_vkn(string value) => Assert.True(TurkishIdentifierValidation.IsValidVkn(value));

    [Theory]
    [InlineData("9876543210")]
    [InlineData("1111111111")]
    [InlineData("123456789")]
    [InlineData("12345678901")]
    [InlineData("12345A7890")]
    [InlineData("")]
    [InlineData(null)]
    public void Rejects_invalid_vkn(string? value) => Assert.False(TurkishIdentifierValidation.IsValidVkn(value));

    [Theory]
    [InlineData("10000000146")]
    [InlineData("12345678950")]
    [InlineData("98765432150")]
    public void Accepts_valid_tckn(string value) => Assert.True(TurkishIdentifierValidation.IsValidTckn(value));

    [Theory]
    [InlineData("10000000147")] // 11th digit wrong
    [InlineData("10000000156")] // 10th digit wrong
    [InlineData("01234567890")] // leading zero
    [InlineData("11111111111")]
    [InlineData("1234567895")]
    [InlineData("1234567895A")]
    [InlineData(null)]
    public void Rejects_invalid_tckn(string? value) => Assert.False(TurkishIdentifierValidation.IsValidTckn(value));

    [Theory]
    [InlineData("TR809999900000000000000001")]
    [InlineData("TR80 9999 9000 0000 0000 0000 01")]
    [InlineData("tr8299999000000000abc12345")]
    [InlineData("DE89370400440532013000")]
    [InlineData("GB29NWBK60161331926819")]
    public void Accepts_valid_iban(string value) => Assert.True(TurkishIdentifierValidation.IsValidIban(value));

    [Theory]
    [InlineData("TR12")]
    [InlineData("TR819999900000000000000001")] // wrong check digits
    [InlineData("TR8099999000000000000000011")] // TR must be 26 characters
    [InlineData("TR80999990000000000000001")]
    [InlineData("DE8937040044053201300")] // DE must be 22 characters
    [InlineData("1R809999900000000000000001")]
    [InlineData("TR8099999000000000000000-1")]
    [InlineData("")]
    [InlineData(null)]
    public void Rejects_invalid_iban(string? value) => Assert.False(TurkishIdentifierValidation.IsValidIban(value));

    [Fact]
    public void Normalizes_iban_by_removing_spaces_and_upper_casing()
    {
        Assert.Equal("TR8299999000000000ABC12345", TurkishIdentifierValidation.NormalizeIban(" tr82 9999 9000 0000 00ab c123 45 "));
        Assert.Null(TurkishIdentifierValidation.NormalizeIban("   "));
    }

    [Fact]
    public void Customer_create_rejects_nine_digit_vkn_and_invalid_tckn_and_iban()
    {
        var errors = CustomerValidation.Validate(new CustomerWriteRequest("C-001", "Example Ltd", CounterpartyType.Customer, "123456789",
            IdentityNumber: "10000000147", Iban: "TR12"));

        Assert.NotNull(errors);
        Assert.Equal([CustomerValidation.InvalidVknMessage], errors["taxNumber"]);
        Assert.Equal([CustomerValidation.InvalidTcknMessage], errors["identityNumber"]);
        Assert.Equal([CustomerValidation.InvalidIbanMessage], errors["iban"]);
    }

    [Fact]
    public void Customer_create_accepts_valid_identifiers()
    {
        var errors = CustomerValidation.Validate(new CustomerWriteRequest("C-001", "Example Ltd", CounterpartyType.Customer, " 9876543217 ",
            IdentityNumber: "10000000146", Iban: "TR80 9999 9000 0000 0000 0000 01"));

        Assert.Null(errors);
    }

    [Fact]
    public void Foreign_customer_tax_number_keeps_length_only_rule()
    {
        var address = new CustomerAddressWriteRequest(CustomerAddressKind.General, "HQ", "Main Street 1", "Berlin", null, null, "DE");
        Assert.Null(CustomerValidation.Validate(new CustomerWriteRequest("C-001", "Example GmbH", CounterpartyType.Customer, "DE123456789", Address: address)));

        var turkishAddress = address with { CountryCode = "tr", City = "Istanbul" };
        var errors = CustomerValidation.Validate(new CustomerWriteRequest("C-001", "Example Ltd", CounterpartyType.Customer, "DE123456789", Address: turkishAddress));
        Assert.NotNull(errors);
        Assert.Contains("taxNumber", errors.Keys);
    }

    [Fact]
    public void Update_keeps_unchanged_legacy_identifiers_but_checks_changed_ones()
    {
        var stored = new CustomerStoredIdentifiers("123456789", "11111111111", "TR12");
        var unchanged = new CustomerWriteRequest("C-001", "Renamed Ltd", CounterpartyType.Customer, " 123456789 ",
            IdentityNumber: "11111111111", Iban: "tr12");
        Assert.Null(CustomerValidation.Validate(unchanged, stored));

        var changed = unchanged with { TaxNumber = "987654321", IdentityNumber = "22222222222", Iban = "TR13" };
        var errors = CustomerValidation.Validate(changed, stored);
        Assert.NotNull(errors);
        Assert.Contains("taxNumber", errors.Keys);
        Assert.Contains("identityNumber", errors.Keys);
        Assert.Contains("iban", errors.Keys);

        // Without stored values (create / bulk import) the legacy values are rejected.
        Assert.NotNull(CustomerValidation.Validate(unchanged));
    }

    [Fact]
    public void Update_still_enforces_storage_shape_rules_on_unchanged_values()
    {
        var stored = new CustomerStoredIdentifiers(null, "1234", null);
        var errors = CustomerValidation.Validate(new CustomerWriteRequest("C-001", "Example Ltd", CounterpartyType.Customer, null, IdentityNumber: "1234"), stored);
        Assert.NotNull(errors);
        Assert.Contains("identityNumber", errors.Keys);
    }
}
