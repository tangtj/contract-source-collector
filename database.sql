create table source
(
    address char(42) not null
        constraint source_pk
            primary key,
    source  text,
    md5     varchar
)