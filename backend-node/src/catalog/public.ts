import { Router } from 'express';
import type { Pool,RowDataPacket } from 'mysql2/promise';

interface Staff {
  id: string;
  displayName: string;
  active: true;
  linked: true;
  serviceIds: string[];
}

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const offers=`FROM businesses b JOIN services s ON s.business_id=b.id AND s.active=TRUE
  JOIN professional_services ps ON ps.business_id=s.business_id AND ps.service_id=s.id AND ps.active=TRUE
  JOIN professionals p ON p.business_id=ps.business_id AND p.id=ps.professional_id AND p.active=TRUE
  JOIN memberships m ON m.business_id=p.business_id AND m.user_id=p.user_id AND m.status='active'
  WHERE b.is_public=TRUE AND EXISTS (SELECT 1 FROM working_hours h WHERE h.business_id=p.business_id AND h.professional_id=p.id)`;

export function publicCatalogRoutes(pool:Pool) {
  const router=Router();
  router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  router.get('/businesses',async(_req,res)=>{
    const [rows]=await pool.query<RowDataPacket[]>('SELECT id,name,sector,address,timezone FROM businesses WHERE is_public=TRUE ORDER BY name,id');
    res.json(rows);
  });
  router.get('/businesses/:id/services',async(req,res)=>{
    if(!uuid.test(req.params.id)){res.status(400).json({code:'invalid_input'});return;}
    if(!await isPublished(pool,req.params.id)){res.status(404).json({code:'not_found'});return;}
    const [rows]=await pool.execute<RowDataPacket[]>(`SELECT DISTINCT s.id,s.business_id AS businessId,s.name,s.description,
      s.duration_minutes AS durationMinutes,s.price_cents AS priceCents,s.currency ${offers} AND b.id=? ORDER BY s.name,s.id`,[req.params.id]);
    res.json(rows.map(row=>({...row,active:true})));
  });
  router.get('/businesses/:id/professionals',async(req,res)=>{
    const service=req.query.serviceId;
    if(!uuid.test(req.params.id)||typeof service!=='string'||!uuid.test(service)){res.status(400).json({code:'invalid_input'});return;}
    if(!await isPublished(pool,req.params.id)){res.status(404).json({code:'not_found'});return;}
    const [rows]=await pool.execute<RowDataPacket[]>(`SELECT p.id,p.display_name AS displayName,s.id AS serviceId ${offers}
      AND b.id=? AND EXISTS (SELECT 1 FROM professional_services selected JOIN services wanted
        ON wanted.business_id=selected.business_id AND wanted.id=selected.service_id AND wanted.active=TRUE
        WHERE selected.business_id=b.id AND selected.professional_id=p.id AND selected.active=TRUE AND selected.service_id=?)
      ORDER BY p.display_name,p.id,s.id`,[req.params.id,service]);
    const staff=new Map<string,Staff>();
    for(const row of rows){
      const professional: Staff = staff.get(row.id) ?? {id:row.id,displayName:row.displayName,active:true,linked:true,serviceIds:[]};
      professional.serviceIds.push(row.serviceId);
      staff.set(row.id,professional);
    }
    res.json([...staff.values()]);
  });
  return router;
}

async function isPublished(pool: Pool, id: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT id FROM businesses WHERE id=? AND is_public=TRUE', [id]);
  return rows.length > 0;
}
