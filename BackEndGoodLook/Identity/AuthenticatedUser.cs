using System.Security.Claims;
namespace BackEndGoodLook.Identity;
public static class AuthenticatedUser
{
    public static bool TryGetId(ClaimsPrincipal principal, out long id)
    {
        id = 0;
        if (principal?.Identity?.IsAuthenticated != true) return false;
        var claims = principal.FindAll(ClaimTypes.NameIdentifier).ToArray();
        return claims.Length == 1 && long.TryParse(claims[0].Value, out id) && id > 0;
    }
}
