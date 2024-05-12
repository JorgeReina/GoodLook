namespace BackEndGoodLook.Models.Database.Entities
{
    public class Cita
    {
        public int CitaId { get; set; }
        public string Date { get; set; }
        public string Hour { get; set; }
        public User User { get; set; }
        public ICollection<Peluquero> Peluqueros { get; set; }
    }
}
