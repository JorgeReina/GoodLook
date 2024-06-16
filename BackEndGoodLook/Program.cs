
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
        public static void Main(string[] args)
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
                    Description = "bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImM2YThlZDIwLTY5MjYtNGQ3OS04OWZjLWUzZmMyNjYyZDlhMCIsInJvbGUiOiJhZG1pbiIsIm5iZiI6MTcxODMwMzA4NCwiZXhwIjoxNzE4NzM1MDg0LCJpYXQiOjE3MTgzMDMwODR9.lLEwndbDiHTNfNqwG7NjAfzU0O1XIx6JlrEZbrVjRMI",
                    In = Microsoft.OpenApi.Models.ParameterLocation.Header,
                    Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
                    Scheme = JwtBearerDefaults.AuthenticationScheme
                });
                options.OperationFilter<SecurityRequirementsOperationFilter>(true, JwtBearerDefaults.AuthenticationScheme);
            });

            builder.Services.AddDbContext<GoodLookContext>(options 
                => options.UseMySQL(builder.Configuration.GetConnectionString("goodLook"))
            );

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

            var app = builder.Build();

            // Configure the HTTP request pipeline.

            using (var scope = app.Services.CreateScope())
            {
                GoodLookContext context = scope.ServiceProvider.GetRequiredService<GoodLookContext>();
                context.Database.EnsureCreated();
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

            app.UseHttpsRedirection();

            // JWT
            app.UseAuthentication();
            app.UseAuthorization();

            app.MapControllers();

            app.Run();
        }
    }
}
