using BackEndGoodLook.Models.Database;
using BackEndGoodLook.Models.Database.Entities;
using BackEndGoodLook.Models.Dtos;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace BackEndGoodLook.Controllers;

[Route("api/[controller]")]
[ApiController]
public class UserController : ControllerBase
{

    private GoodLookContext _goodLookContext;
    private PasswordHasher<string> passwordHasher = new PasswordHasher<string>();

    public UserController(GoodLookContext goodLookContext)
    {
        _goodLookContext = goodLookContext;
    }

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
