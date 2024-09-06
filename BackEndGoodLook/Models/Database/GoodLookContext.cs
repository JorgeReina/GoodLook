using BackEndGoodLook.Models.Database.Entities;
using Microsoft.EntityFrameworkCore;

namespace BackEndGoodLook.Models.Database;

public class GoodLookContext : DbContext
{

    public GoodLookContext(DbContextOptions<GoodLookContext> options)
        : base(options)
    {
    }

    public DbSet<User> Users { get; set; }
    public DbSet<Cita> Citas { get; set; }
    public DbSet<Peluquero> Peluqueros { get; set; }

}
