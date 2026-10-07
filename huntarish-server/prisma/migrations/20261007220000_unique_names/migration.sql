CREATE UNIQUE INDEX "User_name_insensitive_key" ON "User" (lower(btrim("name")));
