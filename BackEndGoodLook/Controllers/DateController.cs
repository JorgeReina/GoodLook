using BackEndGoodLook.Models.Database;
using BackEndGoodLook.Models.Database.Entities;
using BackEndGoodLook.Models.Dtos;
using Microsoft.AspNetCore.Authorization;
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
            var dates = _goodLookContext.Citas.Where(cita => cita.UserId == Id).ToList();

            var dateDtos = dates.Select(DatelistToDto);

            return dateDtos;
        }

        [Authorize(Roles = "user, admin")]
        [HttpGet("getDate")]
        public ActionResult<Boolean> GetUser(string barberEmail, DateTime date, string hour)
        {

            var barber = _goodLookContext.Peluqueros.FirstOrDefault(u => u.Email == barberEmail);

            string formattedDate = date.ToString("yyyy-MM-dd");

            var dateUser = _goodLookContext.Citas.FirstOrDefault(u => u.PeluqueroId == barber.Id && u.Date == formattedDate && u.Hour.Equals(hour));

            if (dateUser == null)
            {
                return true;
            }

            return false;
        }

        [Authorize(Roles = "user, admin")]
        [HttpPost("createDate")]
        public async Task<IActionResult> Post([FromForm] DateDto createDateDto, string barberEmail)
        {
            var barber = _goodLookContext.Peluqueros.FirstOrDefault(u => u.Email == barberEmail);

            Cita newDate = new Cita()
            {
                Date = createDateDto.Date,
                Hour = createDateDto.Hour,
                UserId = createDateDto.UserId,
                PeluqueroId = barber.Id,
            };




            await _goodLookContext.Citas.AddAsync(newDate);
            await _goodLookContext.SaveChangesAsync();

            DateDto dateCreated = DateToDto(newDate);

            return Created($"/{newDate.Id}", dateCreated);
        }

        private DateDto DateToDto(Cita cita)
        {
            return new DateDto()
            {
                Id = cita.Id,
                Date = cita.Date,
                Hour = cita.Hour,
                UserId = cita.UserId,
            };
        }

        private DateDto DatelistToDto(Cita cita)
        {
            return new DateDto()
            {
                Id = cita.Id,
                Date = cita.Date,
                Hour = cita.Hour,
                BarberId = cita.PeluqueroId,
            };
        }
    }
}
