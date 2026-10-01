using Microsoft.EntityFrameworkCore;
using Sg.Api.Data;

namespace Sg.Api.Features.Projects;

public static class ProjectEndpoints
{
    public static void MapProjectEndpoints(this WebApplication app)
    {
        app.MapGet("/api/projects", async (AppDbContext db, CancellationToken cancellationToken) =>
            await db.Projects
                .AsNoTracking()
                .OrderBy(project => project.Title)
                .ThenBy(project => project.Id)
                .Select(project => new ProjectResponse(
                    project.Id, project.Title, project.Description, project.Tags))
                .ToListAsync(cancellationToken));
    }
}

public sealed record ProjectResponse(Guid Id, string Title, string Description, string[] Tags);
