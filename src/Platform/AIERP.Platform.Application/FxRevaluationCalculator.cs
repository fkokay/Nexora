using AIERP.Platform.Domain;

namespace AIERP.Platform.Application;

public static class FxRevaluationCalculator
{
    public static decimal TargetAdjustment(FxRevaluationDirection direction, decimal outstandingAmount,
        decimal invoiceDateRate, decimal closingRate)
    {
        if (outstandingAmount < 0 || invoiceDateRate <= 0 || closingRate <= 0)
            throw new ArgumentOutOfRangeException(nameof(outstandingAmount), "Outstanding amount cannot be negative and exchange rates must be positive.");

        var rateChange = direction == FxRevaluationDirection.Receivable
            ? closingRate - invoiceDateRate
            : invoiceDateRate - closingRate;
        return decimal.Round(rateChange * outstandingAmount, 2, MidpointRounding.AwayFromZero);
    }

    public static decimal PeriodAdjustment(decimal targetAdjustment, decimal previousTargetAdjustment) =>
        targetAdjustment - previousTargetAdjustment;
}
