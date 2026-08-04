from fastapi import APIRouter, HTTPException, status
from bson import ObjectId
from bson.errors import InvalidId

from app.database import warranties_collection
from app.models import WarrantyCreate

router = APIRouter(
    prefix="/warranties",
    tags=["Warranties"]
)


# -----------------------------
# Helper Functions
# -----------------------------

def get_object_id(warranty_id: str) -> ObjectId:
    """
    Convert string ID to MongoDB ObjectId.
    Raises HTTPException if invalid.
    """
    try:
        return ObjectId(warranty_id)
    except InvalidId:
        raise HTTPException(
            status_code=400,
            detail="Invalid warranty ID"
        )


def serialize(document):
    """
    Convert MongoDB ObjectId to string.
    """
    if document:
        document["_id"] = str(document["_id"])
    return document


def serialize_list(cursor):
    """
    Convert list of MongoDB documents.
    """
    return [serialize(doc) for doc in cursor]


# -----------------------------
# CREATE
# -----------------------------

@router.post(
    "/",
    status_code=status.HTTP_201_CREATED
)
def create_warranty(warranty: WarrantyCreate):

    result = warranties_collection.insert_one(
        warranty.model_dump()
    )

    created_warranty = warranties_collection.find_one(
        {"_id": result.inserted_id}
    )

    return serialize(created_warranty)


# -----------------------------
# READ ALL
# -----------------------------

@router.get("/")
def get_warranties(
    skip: int = 0,
    limit: int = 20
):
    warranties = (
        warranties_collection
        .find()
        .sort("_id", -1)
        .skip(skip)
        .limit(limit)
    )

    return serialize_list(warranties)


# -----------------------------
# READ ONE
# -----------------------------

@router.get("/{warranty_id}")
def get_warranty(warranty_id: str):

    object_id = get_object_id(warranty_id)

    warranty = warranties_collection.find_one(
        {"_id": object_id}
    )

    if warranty is None:
        raise HTTPException(
            status_code=404,
            detail="Warranty not found"
        )

    return serialize(warranty)


# -----------------------------
# UPDATE
# -----------------------------

@router.put("/{warranty_id}")
def update_warranty(
    warranty_id: str,
    warranty: WarrantyCreate
):

    object_id = get_object_id(warranty_id)

    result = warranties_collection.update_one(
        {"_id": object_id},
        {
            "$set": warranty.model_dump()
        }
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Warranty not found"
        )

    updated_warranty = warranties_collection.find_one(
        {"_id": object_id}
    )

    return serialize(updated_warranty)


# -----------------------------
# DELETE
# -----------------------------

@router.delete("/{warranty_id}")
def delete_warranty(warranty_id: str):

    object_id = get_object_id(warranty_id)

    result = warranties_collection.delete_one(
        {"_id": object_id}
    )

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Warranty not found"
        )

    return {
        "message": "Warranty deleted successfully"
    }
