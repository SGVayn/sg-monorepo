using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Sg.Api.Data;
using Sg.Api.Features.Projects;
using Testcontainers.PostgreSql;
using Xunit;

namespace Sg.Api.Tests;

// Each test owns a real, disposable PostgreSQL container. Development data is never used.
public sealed class ApiTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer database = new PostgreSqlBuilder("postgres:17-alpine")
        .WithDatabase("sg_test")
        .WithUsername("sg_test")
        .WithPassword(Guid.NewGuid().ToString("N"))
        .Build();

    private ApiFactory factory = null!;
    private HttpClient client = null!;

    public async Task InitializeAsync()
    {
        await database.StartAsync();
        factory = new ApiFactory(database.GetConnectionString());
        client = factory.CreateClient();

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        client?.Dispose();
        if (factory is not null) await factory.DisposeAsync();
        await database.DisposeAsync();
    }

    [Fact]
    public async Task HealthReportsReadyAfterMigration()
    {
        var response = await client.GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ProjectsReturnsTheMigratedPortfolioProject()
    {
        var projects = await client.GetFromJsonAsync<ProjectResponse[]>("/api/projects");
        var project = Assert.Single(Assert.IsType<ProjectResponse[]>(projects));
        Assert.Equal("Three.js Portfolio Experiment", project.Title);
        Assert.Equal(["React", "TypeScript", "Three.js"], project.Tags);
    }

    [Fact]
    public async Task ProjectsReadsPersistedDataAcrossApplicationRestarts()
    {
        var id = Guid.NewGuid();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Projects.Add(new Project
            {
                Id = id,
                Title = "Another project",
                Description = "Persisted in PostgreSQL.",
                Tags = ["C#"]
            });
            await db.SaveChangesAsync();
        }

        await using var restartedApp = new ApiFactory(database.GetConnectionString());
        using var restartedClient = restartedApp.CreateClient();
        var projects = await restartedClient.GetFromJsonAsync<ProjectResponse[]>("/api/projects");
        Assert.NotNull(projects);
        Assert.Equal(2, projects.Length);
        Assert.Equal(id, projects[0].Id);
        Assert.Equal("Persisted in PostgreSQL.", projects[0].Description);
    }

    [Fact]
    public async Task ProjectsReturnsAnEmptyArrayWhenTheTableIsEmpty()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().Projects.ExecuteDeleteAsync();
        var projects = await client.GetFromJsonAsync<ProjectResponse[]>("/api/projects");
        Assert.Empty(Assert.IsType<ProjectResponse[]>(projects));
    }

    [Fact]
    public async Task ReapplyingMigrationsDoesNotDuplicateDataOrLeavePendingChanges()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();
        Assert.Equal(1, await db.Projects.CountAsync());
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.False(db.Database.HasPendingModelChanges());
    }

    [Fact]
    public async Task MissingSchemaReturnsUnhealthyAndSafeProblemDetails()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<AppDbContext>()
            .Database.ExecuteSqlRawAsync("DROP TABLE \"Projects\"");

        var health = await client.GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, health.StatusCode);

        var response = await client.GetAsync("/api/projects");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.NotNull(problem);
        Assert.Equal(500, problem.Status);
        Assert.Null(problem.Detail);
    }

    [Fact]
    public async Task ProjectsDoesNotExposeAnUnauthenticatedWriteEndpoint()
    {
        var response = await client.PostAsJsonAsync("/api/projects", new
        {
            title = "Untrusted write", description = "Should not be stored", tags = Array.Empty<string>()
        });
        Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);
    }

    private sealed class ApiFactory(string connectionString) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:AppDatabase"] = connectionString
                }));
        }
    }
}
