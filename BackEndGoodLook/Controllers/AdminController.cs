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

        public AdminController(GoodLookContext goodLookContext)
        {
            //  Base de Datos
            _goodLookContext = goodLookContext;
        }

        [Authorize(Roles = "admin, user, barber")]
        [HttpGet("barberList")]
        public IEnumerable<BarberDto> GetBarberList()
        {
            return _goodLookContext.Peluqueros.Select(BarberToDto);
        }

        [Authorize(Roles = "admin")]
        [HttpGet("getBarber")]
        public ActionResult<BarberDto> GetBarber(int id)
        {
            var user = _goodLookContext.Peluqueros.FirstOrDefault(u => u.Id == id);

            if (user == null)
            {
                return NotFound();
            }

            var barberDto = new BarberDto
            {
                // Mapear las propiedades necesarias desde User a UserSignDto
                Name = user.Name,
                Email = user.Email,
            };

            return Ok(barberDto);
        }

        [Authorize(Roles = "admin")]
        [HttpPost("createAdmin")]
        public async Task<IActionResult> CreateAdmin([FromForm] CreateUserDto userSignDto)
        {
            string hashedPassword = passwordHasher.HashPassword(userSignDto.Name, userSignDto.Password);

            User newUser = new User()
            {
                Name = userSignDto.Name,
                Email = userSignDto.Email,
                Password = hashedPassword,
                Rol = "admin"
            };

            await _goodLookContext.Users.AddAsync(newUser);
            await _goodLookContext.SaveChangesAsync();

            UserSignDto userCreated = ToDto(newUser);

            return Created($"/{newUser.Id}", userCreated);
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

            await _goodLookContext.Peluqueros.AddAsync(newPeluquero);
            await _goodLookContext.SaveChangesAsync();

            UserSignDto userCreated = ToDto(newUser);

            return Created($"/{newUser.Id}", userCreated);
        }

        [Authorize(Roles = "admin")]
        [HttpDelete("deleteBarber")]
        public IActionResult DeleteUser(string barberEmail)
        {
            try
            {
                // Buscar el usuario en la base de datos
                var userToDelete = _goodLookContext.Users.FirstOrDefault(user => user.Email.Equals(barberEmail));
                var barberToDelete = _goodLookContext.Peluqueros.FirstOrDefault(user => user.Email.Equals(barberEmail));

                if (userToDelete == null)
                {
                    return NotFound($"Usuario con Email {barberEmail} no encontrado");
                }

                // Eliminar el usuario
                _goodLookContext.Users.Remove(userToDelete);
                _goodLookContext.Peluqueros.Remove(barberToDelete);
                _goodLookContext.SaveChanges();

                return Ok(new { Message = "Peluquero eliminado con éxito" });
            }
            catch (Exception ex)
            {
                return BadRequest(new { Error = $"Error al eliminar el usuario: {ex.Message}" });
            }
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
                Id = (int)peluquero.Id,
                Name = peluquero.Name,
                Email = peluquero.Email,
            };
        }
    }
}
