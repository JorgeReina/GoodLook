using BackEndGoodLook.Models.Database;
using BackEndGoodLook.Models.Database.Entities;
using BackEndGoodLook.Models.Dtos;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace BackEndGoodLook.Controllers;

[Route("api/[controller]")]
[ApiController]
public class UserController : ControllerBase
{

    private GoodLookContext _goodLookContext;
    private PasswordHasher<string> passwordHasher = new PasswordHasher<string>();

    private readonly TokenValidationParameters _tokenParameters;

    public UserController(GoodLookContext goodLookContext, IOptionsMonitor<JwtBearerOptions> jwtOptions)
    {
        //  Base de Datos
        _goodLookContext = goodLookContext;

        //  JWToken
        _tokenParameters = jwtOptions.Get(JwtBearerDefaults.AuthenticationScheme)
            .TokenValidationParameters;
    }


    [Authorize(Roles = "user, barber, admin")]
    [HttpGet("userlist")]
    public IEnumerable<UserSignDto> GetUsers()
    {
        return _goodLookContext.Users.Select(ToDto);
    }

    [Authorize(Roles = "user, admin, barber")]
    [HttpGet("getuser")]
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

    [HttpPost("signup")]
    public async Task<IActionResult> Post([FromForm] CreateUserDto userSignDto)
    {
        string hashedPassword = passwordHasher.HashPassword(userSignDto.Name, userSignDto.Password);

        User newUser = new User()
        {
            Name = userSignDto.Name,
            Email = userSignDto.Email,
            Password = hashedPassword,
            Rol = "user"
        };



        await _goodLookContext.Users.AddAsync(newUser);
        await _goodLookContext.SaveChangesAsync();

        UserSignDto userCreated = ToDto(newUser);

        return Created($"/{newUser.Id}", userCreated);
    }

    [HttpPost("login")]
    public IActionResult Login([FromForm] UserLoginDto userLoginDto)
    {

        foreach (User userList in _goodLookContext.Users.ToList())
        {
            if (userList.Email == userLoginDto.Email)
            {
                //  Cifar los datos del usuario
                var result = passwordHasher.VerifyHashedPassword(userList.Name, userList.Password, userLoginDto.Password);

                if (result == PasswordVerificationResult.Success)
                {

                    //  Creamos el Token
                    var tokenDescriptor = new SecurityTokenDescriptor
                    {
                        //  Datos para autorizar al usario
                        Claims = new Dictionary<string, object>
                    {
                        {"id", Guid.NewGuid().ToString() },
                        { ClaimTypes.Role, userList.Rol }
                    },
                        //  Caducidad del Token
                        Expires = DateTime.UtcNow.AddDays(5),
                        //  Clave y algoritmo de firmado
                        SigningCredentials = new SigningCredentials(
                            _tokenParameters.IssuerSigningKey,
                            SecurityAlgorithms.HmacSha256Signature)
                    };

                    //  Creamos el token y lo devolvemos al usuario logeado
                    JwtSecurityTokenHandler tokenHandler = new JwtSecurityTokenHandler();
                    SecurityToken token = tokenHandler.CreateToken(tokenDescriptor);
                    string stringToken = tokenHandler.WriteToken(token);


                    //return Ok(stringToken);
                    return Ok(new { StringToken = stringToken, userList.Id });

                }

            }
        }
        return Unauthorized("Usuario no existe");
    }

    [Authorize(Roles = "user")]
    [HttpPost("updateUser")]
    public async Task<bool> Update([FromForm] string name, [FromForm] string email, [FromForm] string password, [FromForm] int userId)
    {

        var user = _goodLookContext.Users.FirstOrDefault(p => p.Id == userId);


        if (!user.Name.Equals(name) && name != null)
        {
            user.Name = name;
        }

        if (!user.Email.Equals(email) && email != null)
        {
            user.Email = email;
        }

        if (!user.Password.Equals(password) && password != null)
        {
            string hashedPassword = passwordHasher.HashPassword(name, password);
            user.Password = hashedPassword;
        }

        _goodLookContext.Users.Update(user);
        await _goodLookContext.SaveChangesAsync();

        return true;

    }

    [Authorize(Roles = "user")]
    [HttpDelete("deleteUser")]
    public IActionResult DeleteUser(int userId)
    {
        try
        {
            // Buscar el usuario en la base de datos
            var userToDelete = _goodLookContext.Users.FirstOrDefault(user => user.Id == userId);

            if (userToDelete == null)
            {
                return NotFound($"Usuario con ID {userId} no encontrado");
            }

            // Eliminar el usuario
            _goodLookContext.Users.Remove(userToDelete);
            _goodLookContext.SaveChanges();

            return Ok(new { Message = "Usuario eliminado con éxito" });
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

}
