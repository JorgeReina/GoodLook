using BackEndGoodLook.Models.Database;
using BackEndGoodLook.Models.Database.Entities;
using BackEndGoodLook.Models.Dtos;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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


    [Authorize(Roles = "user")]
    [HttpGet("userlist")]
    public IEnumerable<UserSignDto> GetUser()
    {
        return _goodLookContext.Users.Select(ToDto);
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
