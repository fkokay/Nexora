namespace AIERP.AIService.AI;

public static class ERPAssistantSharingConsent
{
    public static Task<T> InvokeProviderAsync<T>(bool confirmed, Func<Task<T>> providerCall)
    {
        ArgumentNullException.ThrowIfNull(providerCall);
        if (!confirmed) throw new InvalidOperationException("Explicit AI data-sharing consent is required.");
        return providerCall();
    }
}
