namespace BackEndGoodLook.Models.Database.Entities;

public class Peluquero
{
    public int PeluqueroId { get; set; }
    public string Name { get; set; }
    public string Email { get; set; }
    public ICollection<Cita> Citas { get; set; }
}
