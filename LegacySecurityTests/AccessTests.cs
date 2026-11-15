using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using BackEndGoodLook.Identity;
using Microsoft.AspNetCore.Identity;
using System.Text;
using BackEndGoodLook.Controllers;
using BackEndGoodLook.Models.Database;
using BackEndGoodLook.Models.Database.Entities;
using BackEndGoodLook.Models.Dtos;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

internal static class AccessTests
{
    private static ControllerContext Context(long id, string role) => new()
    {
        HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
            new Claim(ClaimTypes.NameIdentifier, id.ToString()), new Claim(ClaimTypes.Role, role)
        }, "test")) }
    };
    private static void Denied(object? result, string name) {
        if (result is not ForbidResult) throw new Exception($"{name} must reject access to another user");
        Console.WriteLine($"PASS {name} blocks cross-user access");
    }
    public static async Task Run() {
        var options = new DbContextOptionsBuilder<GoodLookContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new GoodLookContext(options);
        db.Users.AddRange(new User { Id=1, Name="A", Email="a@example.invalid", Password="test", Rol="user" }, new User { Id=2, Name="B", Email="b@example.invalid", Password="test", Rol="user" });
        db.Peluqueros.AddRange(new Peluquero { Id=10, Name="A", Email="a@example.invalid" }, new Peluquero { Id=20, Name="B", Email="b@example.invalid" });
        db.Citas.Add(new Cita { Id=100, UserId=2, PeluqueroId=20, Date="2030-01-01", Hour="10:00" });
        await db.SaveChangesAsync();
        var monitor = new Monitor();
        var users = new UserController(db, monitor) { ControllerContext = Context(1, "user") };
        Denied(users.GetUser(2).Result, "getuser");
        Denied((object)await users.Update("X", "x@example.invalid", null!, 2), "updateUser");
        Denied(users.DeleteUser(2), "deleteUser");
        var dates = new DateController(db) { ControllerContext = Context(1, "user") };
        Denied((object)dates.GetDate(2), "dateList");
        Denied(await dates.Post(new DateDto { UserId=2, Date="2030-01-02", Hour="10:00" }, "b@example.invalid"), "createDate");
        var barber = new BarberController(db) { ControllerContext = Context(1, "barber") };
        Denied((object)barber.GetDate(2), "barber dateList");
        if (db.Users.Single(u=>u.Id==2).Name != "B" || db.Citas.Count()!=1) throw new Exception("Cross-user mutation occurred");
        if (users.GetUser(1).Result is not OkObjectResult) throw new Exception("Own profile denied");
        var admin = new UserController(db, monitor) { ControllerContext = Context(1, "admin") };
        if (admin.GetUser(2).Result is not OkObjectResult) throw new Exception("Administrator profile access denied");
        var noSubject = new UserController(db, monitor) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.Role, "user") }, "test")) } } };
        if (noSubject.GetUser(1).Result is not UnauthorizedResult) throw new Exception("Missing subject accepted");
        if (dates.GetDate(1) is not OkObjectResult) throw new Exception("Own appointments denied");
        if (barber.GetDate(1) is not OkObjectResult) throw new Exception("Own professional calendar denied");
        var ownBooking = await dates.Post(new DateDto { UserId=1, Date="2030-01-02", Hour="10:00" }, "a@example.invalid");
        if (ownBooking is not CreatedResult || db.Citas.Single(c => c.Id != 100).UserId != 1) throw new Exception("Own booking denied or attributed incorrectly");
        Console.WriteLine("PASS own profile, calendars and booking");
        var hasher = new PasswordHasher<string>();
        db.Users.Single(u=>u.Id==1).Password = hasher.HashPassword("A", "test-password-only");
        await db.SaveChangesAsync();
        var login = users.Login(new UserLoginDto { Email="a@example.invalid", Password="test-password-only" }) as OkObjectResult ?? throw new Exception("Login failed");
        string token = (string)(login.Value?.GetType().GetProperty("StringToken")?.GetValue(login.Value) ?? throw new Exception("Missing token"));
        var validation = monitor.Get("").TokenValidationParameters;
        validation.ValidateIssuer = false; validation.ValidateAudience = false; validation.ValidateLifetime = true; validation.ValidateIssuerSigningKey = true;
        var principal = new JwtSecurityTokenHandler().ValidateToken(token, validation, out _);
        if (!AuthenticatedUser.TryGetId(principal, out var id) || id != 1) throw new Exception("Signed login token does not map subject to authenticated user");
        var oldPrincipal = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("id", Guid.NewGuid().ToString()) }, "test"));
        if (AuthenticatedUser.TryGetId(oldPrincipal, out _)) throw new Exception("Old session without subject accepted");
        Console.WriteLine("PASS signed JWT subject and rejection of legacy identity");
    }
    private sealed class Monitor : IOptionsMonitor<JwtBearerOptions> {
        public JwtBearerOptions CurrentValue => Get("");
        public JwtBearerOptions Get(string? name) => new() { TokenValidationParameters = new() { IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("synthetic-only-secret-key-32bytes")) } };
        public IDisposable OnChange(Action<JwtBearerOptions,string?> listener) => null!;
    }
}
