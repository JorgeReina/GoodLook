using BackEndGoodLook.Models.Database.Entities;
using Microsoft.AspNetCore.Identity;

namespace BackEndGoodLook.Models.Database;

public class DbSeeder
{
    private readonly GoodLookContext _goodLookContext;

    public DbSeeder(GoodLookContext goodLookContext)
    {
        _goodLookContext = goodLookContext;
    }

    public async Task SeedAsync()
    {
        bool created = await _goodLookContext.Database.EnsureCreatedAsync();

        if (created)
        {
            await SeedAdminAsync();
        }

        _goodLookContext.SaveChanges();
    }

    private async Task SeedAdminAsync()
    {

        User newUser = new User()
        {
            Name = "admin",
            Email = "admin@admin.com",
            Password = "AQAAAAIAAYagAAAAEEYade09YPGdqlXbgp01dxVxuEZeOFDiXoIKxdTnJkFGooMH4hxN02LYfQkqlVsgxA==",
            Rol = "admin"
        };

        await _goodLookContext.Users.AddRangeAsync(newUser);
    }
}
