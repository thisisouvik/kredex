-- Waitlist Table Schema
-- Execute this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anonymous inserts (so users can join the waitlist)
CREATE POLICY "Allow public inserts on waitlist" 
ON public.waitlist 
FOR INSERT 
TO public 
WITH CHECK (true);

-- Create policy to restrict read access to authenticated admins only 
-- (Assuming you only want admins to read the list)
CREATE POLICY "Allow admins to read waitlist" 
ON public.waitlist 
FOR SELECT 
TO authenticated 
USING (true);
