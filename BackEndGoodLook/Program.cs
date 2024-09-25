
using BackEndGoodLook.Models.Database;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Swashbuckle.AspNetCore.Filters;
using System.Text;

namespace BackEndGoodLook
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.

            builder.Services.AddControllers();
            // Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddSwaggerGen(options =>
            {
                options.AddSecurityDefinition(JwtBearerDefaults.AuthenticationScheme, new Microsoft.OpenApi.Models.OpenApiSecurityScheme
                {
                    BearerFormat = "JWT",
                    Name = "Authorization",
                    Description = "",
                    In = Microsoft.OpenApi.Models.ParameterLocation.Header,
                    Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
                    Scheme = JwtBearerDefaults.AuthenticationScheme
                });
                options.OperationFilter<SecurityRequirementsOperationFilter>(true, JwtBearerDefaults.AuthenticationScheme);
            });

            string connection = builder.Configuration.GetConnectionString("goodLook");

            builder.Services.AddDbContext<GoodLookContext>(options 
                => options.UseMySql(connection, ServerVersion.AutoDetect(connection))
            );

            builder.Services.AddTransient<DbSeeder>();

            builder.Services.AddAuthentication().AddJwtBearer(options =>
            {
                //string Key = Environment.GetEnvironmentVariable("JWT_KEY");
                string Key = builder.Configuration["JWT_KEY"];
                options.TokenValidationParameters = new TokenValidationParameters()
                {
                    //  Validar el emisor del token.
                    ValidateIssuer = false,

                    //  Audiencia
                    ValidateAudience = false,

                    //  Idicamos la clave
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Key))
                };
            });

            builder.Services.AddCors(options =>
            {
                options.AddDefaultPolicy(builder =>
                {
                    builder.SetIsOriginAllowed(origin => true)
                    .AllowAnyHeader()
                    .AllowAnyMethod();
                });
            });


            var app = builder.Build();

            // Configure the HTTP request pipeline.

            using (var scope = app.Services.CreateScope())
            {
                GoodLookContext context = scope.ServiceProvider.GetRequiredService<GoodLookContext>();
                //context.Database.EnsureCreated();
                DbSeeder dbSeeder = scope.ServiceProvider.GetService<DbSeeder>();
                await dbSeeder.SeedAsync();
            }

            if (app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();

                //Uso de CORS
                app.UseCors(config => config
                    .AllowAnyMethod()
                    .AllowAnyHeader()
                    .SetIsOriginAllowed(origin => true)
                    .AllowCredentials());

            }

            app.UseCors();

            app.UseHttpsRedirection();

            // JWT
            app.UseAuthentication();
            app.UseAuthorization();

            app.MapControllers();

            app.Run();
        }
    }
}
