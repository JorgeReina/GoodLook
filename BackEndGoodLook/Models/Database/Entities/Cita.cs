namespace BackEndGoodLook.Models.Database.Entities
{
    public class Cita
    {
        public int CitaId { get; set; }
        public string Date { get; set; }
        public string Hour { get; set; }

        public int UserId { get; set; }
        public int PeluquerosId { get; set; }
    }
}
