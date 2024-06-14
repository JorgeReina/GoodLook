using BackEndGoodLook.Models.Database;
using BackEndGoodLook.Models.Database.Entities;
using BackEndGoodLook.Models.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace BackEndGoodLook.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class DateController : Controller
    {
        private GoodLookContext _goodLookContext;

        public DateController(GoodLookContext goodLookContext)
        {
            //  Base de Datos
            _goodLookContext = goodLookContext;
        }

        [Authorize(Roles = "user, admin")]
        [HttpGet("dateList")]
        public IEnumerable<DateDto> GetDate(int Id)
        {
            var dates = _goodLookContext.Cita.Where(cita => cita.UserId == Id).ToList();

            var dateDtos = dates.Select(DateToDto);

            return dateDtos;
        }

        [Authorize(Roles = "user, admin")]
        [HttpPost("createDate")]
        public async Task<IActionResult> Post([FromForm] DateDto createDateDto, int barberId)
        {

            var user = _goodLookContext.Users.FirstOrDefault(u => u.Id == createDateDto.UserId);
            var barber = _goodLookContext.Peluquero.FirstOrDefault(u => u.PeluqueroId == createDateDto.PeluquerosId);

            Cita newDate = new Cita()
            {
                Date = createDateDto.Date,
                Hour = createDateDto.Hour,
                UserId = createDateDto.UserId,
                PeluquerosId = barberId,
            };




            await _goodLookContext.Cita.AddAsync(newDate);
            await _goodLookContext.SaveChangesAsync();

            DateDto dateCreated = DateToDto(newDate);

            return Created($"/{newDate.CitaId}", dateCreated);
        }

        private DateDto DateToDto(Cita cita)
        {
            return new DateDto()
            {
                Id = (int)cita.CitaId,
                Date = cita.Date,
                Hour = cita.Hour,
                UserId = cita.UserId,
            };
        }
    }
}
