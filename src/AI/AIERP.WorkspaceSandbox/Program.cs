var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddHostedService<TestJobWorker>();
await builder.Build().RunAsync();
