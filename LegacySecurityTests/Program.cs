using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json;
using BackEndGoodLook.Controllers;
using BackEndGoodLook.Models.Database.Entities;
using BackEndGoodLook.Models.Dtos;

// Exercise the actual response mappers with a synthetic hash, without a DB.
const string syntheticHash = "TEST_ONLY_HASH_SHOULD_NOT_APPEAR";
var syntheticUser = new User { Id = 41, Name = "test", Email = "test@example.invalid", Rol = "user", Password = syntheticHash };
foreach (var controllerType in new[] { typeof(UserController), typeof(AdminController) })
{
    var controller = RuntimeHelpers.GetUninitializedObject(controllerType);
    var mapper = controllerType.GetMethod("ToDto", BindingFlags.Instance | BindingFlags.NonPublic)
        ?? throw new Exception($"{controllerType.Name}: response mapper missing");
    var dto = mapper.Invoke(controller, new object[] { syntheticUser });
    var json = JsonSerializer.Serialize(dto, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    if (json.Contains(syntheticHash, StringComparison.Ordinal) || json.Contains("password", StringComparison.OrdinalIgnoreCase))
        throw new Exception($"{controllerType.Name}: response contains password or hash");
    var parsed = JsonSerializer.Deserialize<UserSignDto>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? throw new Exception("Missing response");
    if (parsed.Id != 41 || parsed.Email != "test@example.invalid") throw new Exception("Safe fields not preserved");
    Console.WriteLine($"PASS {controllerType.Name} does not expose password");
}
await AccessTests.Run();
