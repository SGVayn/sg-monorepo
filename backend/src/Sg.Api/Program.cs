using Microsoft.EntityFrameworkCore;
using Sg.Api.Data;
using Sg.Api.Features.Projects;
using Sg.Api.Health;

var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsDevelopment())
{
    builder.Configuration
        .AddJsonFile("appsettings.Development.local.json", optional: true, reloadOnChange: false)
        .AddEnvironmentVariables()
        .AddCommandLine(args);
}

builder.Services.AddDbContext<AppDbContext>((services, options) =>
    options.UseNpgsql(services.GetRequiredService<IConfiguration>().GetConnectionString("AppDatabase")));
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database");

var app = builder.Build();

if (string.IsNullOrWhiteSpace(app.Configuration.GetConnectionString("AppDatabase")))
{
    throw new InvalidOperationException(
        "Database connection is missing. Run npm run setup:dev, or set ConnectionStrings__AppDatabase.");
}

// Schema changes are an explicit operation, never a side effect of starting the API.
if (args.Contains("--migrate"))
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    app.Logger.LogInformation("Database migrations are up to date.");
    return;
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.MapHealthChecks("/api/health");
app.MapProjectEndpoints();

app.Run();

// Exposes the entry point to the integration test host.
public partial class Program;
