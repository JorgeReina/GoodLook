namespace BackEndGoodLook.Models.Database.Entities
{
    public class Cita
    {
        public long Id { get; set; }
        public string Date { get; set; }
        public string Hour { get; set; }

        public long UserId { get; set; }
        public long PeluqueroId { get; set; }
    }
}
