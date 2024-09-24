using BackEndGoodLook.Models.Database;
using Microsoft.AspNetCore.Mvc;

namespace BackEndGoodLook.Controllers;

[Route("api/[controller]")]
[ApiController]
public class GuestController : Controller
{
    private GoodLookContext _goodLookContext;

    public GuestController(GoodLookContext goodLookContext)
    {
        _goodLookContext = goodLookContext;
    }
    
}
