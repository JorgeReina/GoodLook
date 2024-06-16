using BackEndGoodLook.Models.Database;
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
        public IEnumerable<DateDto> GetDate(int Id)
        {
            var user = _goodLookContext.Users.FirstOrDefault(x => x.Id == Id);
            var barber = _goodLookContext.Peluquero.FirstOrDefault(u => u.Email.Equals(user.Email));

            var dates = _goodLookContext.Cita.Where(cita => cita.PeluquerosId == barber.PeluqueroId).ToList();

            var dateDtos = dates.Select(DatelistToDto);

            return dateDtos;
        }

        private DateDto DatelistToDto(Cita cita)
        {
            return new DateDto()
            {
                Id = cita.CitaId,
                Date = cita.Date,
                Hour = cita.Hour,
                UserId = cita.UserId,
                BarberId = cita.PeluquerosId,
            };
        }
    }
}
