using BackEndGoodLook.Models.Database;
using BackEndGoodLook.Identity;
using BackEndGoodLook.Models.Database.Entities;
using BackEndGoodLook.Models.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BackEndGoodLook.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class BarberController : Controller
    {
        private GoodLookContext _goodLookContext;

        public BarberController(GoodLookContext goodLookContext)
        {
            //  Base de Datos
            _goodLookContext = goodLookContext;
        }

        [Authorize(Roles = "barber")]
        [HttpGet("dateList")]
        public IActionResult GetDate(int Id)
        {
            if (!AuthenticatedUser.TryGetId(User, out var currentId)) return Unauthorized();
            if (currentId != Id) return Forbid();
            var user = _goodLookContext.Users.FirstOrDefault(x => x.Id == Id);
            if (user == null) return NotFound();
            var barber = _goodLookContext.Peluqueros.FirstOrDefault(u => u.Email.Equals(user.Email));
            if (barber == null) return NotFound();

            var dates = _goodLookContext.Citas.Where(cita => cita.PeluqueroId == barber.Id).ToList();

            var dateDtos = dates.Select(DatelistToDto);

            return Ok(dateDtos);
        }

        private DateDto DatelistToDto(Cita cita)
        {
            return new DateDto()
            {
                Id = cita.Id,
                Date = cita.Date,
                Hour = cita.Hour,
                UserId = cita.UserId,
                BarberId = cita.PeluqueroId,
            };
        }
    }
}
