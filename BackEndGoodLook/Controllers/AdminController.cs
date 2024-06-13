using BackEndGoodLook.Models.Database;
using BackEndGoodLook.Models.Database.Entities;
using BackEndGoodLook.Models.Dtos;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace BackEndGoodLook.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AdminController : Controller
    {
        private GoodLookContext _goodLookContext;
        private PasswordHasher<string> passwordHasher = new PasswordHasher<string>();

        public AdminController(GoodLookContext goodLookContext, IOptionsMonitor<JwtBearerOptions> jwtOptions)
        {
            //  Base de Datos
            _goodLookContext = goodLookContext;
        }

        [Authorize(Roles = "admin")]
        [HttpGet("barberList")]
        public IEnumerable<BarberDto> GetUsers()
        {
            return _goodLookContext.Peluquero.Select(BarberToDto);
        }

        [Authorize(Roles = "admin")]
        [HttpGet("getBarber")]
        public ActionResult<UserSignDto> GetUser(int id)
        {
            var user = _goodLookContext.Users.FirstOrDefault(u => u.Id == id);

            if (user == null)
            {
                return NotFound();
            }

            var userSignDto = new UserSignDto
            {
                // Mapear las propiedades necesarias desde User a UserSignDto
                Name = user.Name,
                Email = user.Email,
                Rol = user.Rol,
            };

            return Ok(userSignDto);
        }

        [Authorize(Roles = "admin")]
        [HttpPost("createBarber")]
        public async Task<IActionResult> Post([FromForm] CreateUserDto userSignDto)
        {
            string hashedPassword = passwordHasher.HashPassword(userSignDto.Name, userSignDto.Password);

            User newUser = new User()
            {
                Name = userSignDto.Name,
                Email = userSignDto.Email,
                Password = hashedPassword,
                Rol = "barber"
            };

            Peluquero newPeluquero = new Peluquero()
            {
                Name = userSignDto.Name,
                Email = userSignDto.Email,
            };



            await _goodLookContext.Users.AddAsync(newUser);
            await _goodLookContext.SaveChangesAsync();

            await _goodLookContext.Peluquero.AddAsync(newPeluquero);
            await _goodLookContext.SaveChangesAsync();

            UserSignDto userCreated = ToDto(newUser);

            return Created($"/{newUser.Id}", userCreated);
        }

        private UserSignDto ToDto(User users)
        {
            return new UserSignDto()
            {
                Id = (int)users.Id,
                Name = users.Name,
                Email = users.Email,
                Password = users.Password,
                Rol = users.Rol
            };
        }

        private BarberDto BarberToDto(Peluquero peluquero)
        {
            return new BarberDto()
            {
                Id = (int)peluquero.PeluqueroId,
                Name = peluquero.Name,
                Email = peluquero.Email,
            };
        }
    }
}
