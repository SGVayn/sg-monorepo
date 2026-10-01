using Microsoft.EntityFrameworkCore;
using Sg.Api.Features.Projects;

namespace Sg.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var project = modelBuilder.Entity<Project>();
        project.HasKey(item => item.Id);
        project.Property(item => item.Title).HasMaxLength(200).IsRequired();
        project.Property(item => item.Description).HasMaxLength(4000).IsRequired();
        project.Property(item => item.Tags).IsRequired();

        project.HasData(new Project
        {
            Id = Guid.Parse("d6cf221f-9514-44fc-a3fa-8e0c832a86bd"),
            Title = "Three.js Portfolio Experiment",
            Description = "A creative web experiment using React, TypeScript and Three.js.",
            Tags = ["React", "TypeScript", "Three.js"]
        });
    }
}
